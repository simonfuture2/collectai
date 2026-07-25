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
      .select("id, user_id, paired_raw_card_id").eq("id", graded_card_id).maybeSingle();
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
      .select("id, user_id, superseded_by_card_id").eq("id", raw_card_id).maybeSingle();
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

    await admin.from("cards").update({ paired_raw_card_id: raw_card_id }).eq("id", graded_card_id);
    await admin.from("cards").update({ superseded_by_card_id: graded_card_id }).eq("id", raw_card_id);

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
