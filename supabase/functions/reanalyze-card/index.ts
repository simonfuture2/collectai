// Client-callable wrapper that re-runs the full enrich-card pipeline for an
// existing card row the user already owns. Validates ownership, regenerates a
// signed image URL from the stored image_path, and dispatches enrich-card.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
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

    const body = await req.json().catch(() => ({}));
    const cardId = String(body.cardId || "").trim();
    if (!cardId) {
      return new Response(JSON.stringify({ error: "cardId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey);
    const { data: card, error: cardErr } = await supabaseAdmin
      .from("cards")
      .select("id, user_id, image_url, category")
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
