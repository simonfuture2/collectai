import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { graded_card_id, raw_card_id, unpair } = await req.json();
    if (!graded_card_id) {
      return new Response(JSON.stringify({ error: "graded_card_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify ownership of both
    const { data: graded } = await admin.from("cards")
      .select("id, user_id, paired_raw_card_id, card_name, grading_company, grade_numeric, grading_cert_number, authentication_data")
      .eq("id", graded_card_id).maybeSingle();
    if (!graded || graded.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (unpair) {
      const prev = graded.paired_raw_card_id;
      await admin.from("cards").update({ paired_raw_card_id: null }).eq("id", graded_card_id);
      if (prev) {
        await admin.from("cards").update({ superseded_by_card_id: null }).eq("id", prev);
      }
      return new Response(JSON.stringify({ success: true, unpaired: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!raw_card_id) {
      return new Response(JSON.stringify({ error: "raw_card_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (raw_card_id === graded_card_id) {
      return new Response(JSON.stringify({ error: "Cannot pair a card with itself" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: raw } = await admin.from("cards")
      .select("id, user_id, superseded_by_card_id, card_name, card_set, card_year, edition, rarity")
      .eq("id", raw_card_id).maybeSingle();
    if (!raw || raw.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Raw card not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Clear any prior pairing on graded side
    if (graded.paired_raw_card_id && graded.paired_raw_card_id !== raw_card_id) {
      await admin.from("cards").update({ superseded_by_card_id: null })
        .eq("id", graded.paired_raw_card_id);
    }

    // If graded card was saved as "Unknown …" (or has no name), copy identity
    // from the raw scan so the market lookup can actually run.
    const looksUnknown = (n: unknown) => !n || /^unknown\b/i.test(String(n ?? "").trim());
    const identityPatch: Record<string, unknown> = { paired_raw_card_id: raw_card_id };
    if (looksUnknown((graded as any).card_name) && !looksUnknown((raw as any).card_name)) {
      identityPatch.card_name = (raw as any).card_name;
      identityPatch.card_set = (raw as any).card_set ?? null;
      identityPatch.card_year = (raw as any).card_year ?? null;
      identityPatch.edition = (raw as any).edition ?? null;
      identityPatch.rarity = (raw as any).rarity ?? null;
    }
    await admin.from("cards").update(identityPatch).eq("id", graded_card_id);
    await admin.from("cards").update({ superseded_by_card_id: graded_card_id }).eq("id", raw_card_id);

    // If the graded card has a confirmed slab grade, kick off a re-enrichment
    // so Market Value refreshes to graded (e.g. BGS 8) comps using the paired
    // identity we just wrote.
    if ((graded as any).grading_company && (graded as any).grade_numeric != null) {
      const slabImages = ((graded as any).authentication_data?.images) as
        | { label: string; url: string }[] | undefined;
      if (Array.isArray(slabImages) && slabImages.length > 0) {
        try {
          const enrichRes = fetch(`${supabaseUrl}/functions/v1/enrich-card`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${serviceKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              cardId: graded_card_id,
              images: slabImages,
              fastScan: false,
              knownGrade: {
                company: (graded as any).grading_company,
                numeric: Number((graded as any).grade_numeric),
                cert_number: (graded as any).grading_cert_number ?? null,
              },
            }),
          });
          // @ts-ignore
          if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
            // @ts-ignore
            EdgeRuntime.waitUntil(enrichRes.catch(() => {}));
          }
        } catch (err) {
          console.error("[pair-cards] enrich kick-off failed:", err);
        }
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
