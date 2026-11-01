// Client-callable wrapper that re-runs the full enrich-card pipeline for an
// existing card row the user already owns. Validates ownership, regenerates a
// signed image URL from the stored image_path, and dispatches enrich-card.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { PRICE_ONLY_UPGRADE_CREDITS } from "./rules.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid auth" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = z.object({ cardId: z.string().uuid(), priceOnlyUpgrade: z.boolean().optional() }).safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Valid cardId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { cardId, priceOnlyUpgrade } = parsed.data;

    const supabaseAdmin = createClient(supabaseUrl, serviceKey);
    const { data: card, error: cardErr } = await supabaseAdmin
      .from("cards")
      .select("id, user_id, image_url, category, analysis_depth, analysis_status")
      .eq("id", cardId)
      .maybeSingle();
    if (cardErr || !card) {
      return new Response(JSON.stringify({ error: "Card not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (card.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!card.image_url) {
      return new Response(JSON.stringify({ error: "Card has no image to re-analyze" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate a fresh signed URL from the stored path.
    let signedUrl: string;
    const imagePath = String(card.image_url);
    if (imagePath.startsWith("http")) {
      signedUrl = imagePath;
    } else {
      const { data: signed, error: signErr } = await supabaseAdmin.storage
        .from("card-images")
        .createSignedUrl(imagePath, 3600);
      if (signErr || !signed?.signedUrl) {
        console.error("[reanalyze-card] sign failed:", signErr);
        return new Response(JSON.stringify({ error: "Could not access card image" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      signedUrl = signed.signedUrl;
    }

    // Claim price-only upgrades before billing so concurrent requests cannot charge twice.
    if (priceOnlyUpgrade || card.analysis_depth === "price_only") {
      const { data: claimed, error: claimError } = await supabaseAdmin.from("cards")
        .update({ analysis_status: "identifying", analysis_started_at: new Date().toISOString() })
        .eq("id", cardId).eq("user_id", user.id).eq("analysis_depth", "price_only").eq("analysis_status", "complete")
        .select("id").maybeSingle();
      if (claimError || !claimed) return new Response(JSON.stringify({ error: "Analysis has already been requested for this card" }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
      // Exactly one credit, including Pro accounts; the free price-check flow never reaches this action.
      const { data: remaining, error: creditError } = await supabaseAdmin.rpc("deduct_credit", { _user_id: user.id });
      if (creditError || remaining == null || remaining < 0) {
        await supabaseAdmin.from("cards").update({ analysis_status: "complete", analysis_started_at: null }).eq("id", cardId);
        return new Response(JSON.stringify({ error: `Full analysis requires ${PRICE_ONLY_UPGRADE_CREDITS} credit` }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      await supabaseAdmin.from("cards").update({ analysis_depth: "full" }).eq("id", cardId);
    }

    // Reset analysis state so the UI shows the in-progress flow.
    await supabaseAdmin.from("cards").update({
      analysis_status: "identifying",
      analysis_started_at: new Date().toISOString(),
      analysis_completed_at: null,
      analysis_error: null,
    }).eq("id", cardId);

    // Dispatch enrich-card (service-role authenticated, fire-and-forget).
    const enrichUrl = `${supabaseUrl}/functions/v1/enrich-card`;
    const enrichPromise = fetch(enrichUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        cardId,
        images: [{ label: "Front", url: signedUrl }],
        category: card.category || "Trading Card",
        fastScan: false,
      }),
    }).catch((err) => console.error("[reanalyze-card] enrich dispatch failed:", err));

    // @ts-ignore - EdgeRuntime exists in Deno Deploy
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(enrichPromise);
    }

    console.log(`[reanalyze-card] dispatched card=${cardId} user=${user.id}`);

    return new Response(JSON.stringify({ status: "started", cardId }), {
      status: 202,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[reanalyze-card] error:", err);
    return new Response(JSON.stringify({ error: "Re-analysis failed to start" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
