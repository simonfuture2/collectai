import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function norm(s: unknown): string {
  return String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

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
    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { graded_card_id } = await req.json();
    if (!graded_card_id) {
      return new Response(JSON.stringify({ error: "graded_card_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: graded } = await supabase
      .from("cards")
      .select("id, user_id, card_name, card_set, card_year, edition, rarity")
      .eq("id", graded_card_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!graded) {
      return new Response(JSON.stringify({ candidates: [] }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: raw } = await supabase
      .from("cards")
      .select("id, image_url, card_name, card_set, card_year, edition, rarity, condition_grade, estimated_value_low, estimated_value_high, created_at")
      .eq("user_id", user.id)
      .neq("id", graded_card_id)
      .is("is_authenticated", false)
      .is("superseded_by_card_id", null);

    const gName = norm(graded.card_name);
    const gSet = norm(graded.card_set);
    const gEd = norm(graded.edition);
    const gYear = norm(graded.card_year);

    const scored = (raw ?? []).map((c) => {
      let score = 0;
      if (gName && norm(c.card_name) === gName) score += 4;
      else if (gName && norm(c.card_name).includes(gName)) score += 2;
      if (gSet && norm(c.card_set) === gSet) score += 3;
      if (gEd && norm(c.edition) === gEd) score += 2;
      if (gYear && norm(c.card_year) === gYear) score += 1;
      return { card: c, score };
    })
    .filter((s) => s.score >= 4)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

    return new Response(
      JSON.stringify({ candidates: scored.map((s) => ({ ...s.card, confidence: Math.min(1, s.score / 10) })) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
