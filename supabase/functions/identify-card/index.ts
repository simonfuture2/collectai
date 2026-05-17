// Phase 1 (instant): validate auth + credits, save a placeholder card row,
// deduct credit, fire-and-forget enrich-card, return { cardId } in ~1-3s.
// All AI work (identify + pricing) runs in the background enrich-card function.
import "https://deno.land/x/xhr@0.1.0/mod.ts";
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

    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    // Rate limit: 10/hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recentScans } = await supabaseAdmin
      .from("credit_transactions")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id).eq("type", "scan").gte("created_at", oneHourAgo);
    if ((recentScans ?? 0) >= 10) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded — max 10 scans per hour." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: creditsData } = await supabaseAdmin
      .from("user_credits").select("credits, plan").eq("user_id", user.id).single();
    const isPro = creditsData?.plan === "pro";
    const hasCredits = (creditsData?.credits ?? 0) > 0;
    if (!isPro && !hasCredits) {
      return new Response(JSON.stringify({ error: "Insufficient credits." }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const images: { label: string; url: string }[] = body.images || [];
    if (images.length === 0 && body.imageUrl) images.push({ label: "Front", url: body.imageUrl });
    if (images.length === 0) {
      return new Response(JSON.stringify({ error: "At least one image is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate URLs (must be signed URLs from card-images bucket, owned by user)
    const ALLOWED_BUCKET = "card-images";
    const signedUrlPattern = `${supabaseUrl}/storage/v1/object/sign/${ALLOWED_BUCKET}/`;
    for (const img of images) {
      if (!img.url.startsWith(signedUrlPattern)) {
        return new Response(JSON.stringify({ error: `Invalid image URL for "${img.label}"` }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      try {
        const url = new URL(img.url);
        const parts = url.pathname.split("/");
        const idx = parts.indexOf("card-images");
        if (idx === -1 || parts[idx + 1] !== user.id) {
          return new Response(JSON.stringify({ error: "Unauthorized image" }), {
            status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } catch {
        return new Response(JSON.stringify({ error: "Invalid URL" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Extract file path from first image
    let imagePath = "";
    try {
      const url = new URL(images[0].url);
      const parts = url.pathname.split("/");
      const idx = parts.indexOf("card-images");
      if (idx !== -1) imagePath = parts.slice(idx + 1).join("/");
    } catch { /* noop */ }
    if (!imagePath) imagePath = body.filePath || images[0].url;

    // Duplicate check
    const { data: existingCard } = await supabaseAdmin
      .from("cards").select("id").eq("user_id", user.id).eq("image_url", imagePath).maybeSingle();
    if (existingCard) {
      return new Response(JSON.stringify({ cardId: existingCard.id, duplicate: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const category = body.category || "Trading Card";

    // Insert placeholder row INSTANTLY — no AI calls here.
    const { data: savedCard, error: insertErr } = await supabaseAdmin
      .from("cards")
      .insert({
        user_id: user.id,
        image_url: imagePath,
        category,
        card_name: null,
        last_scanned_at: new Date().toISOString(),
        analysis_status: "identifying",
        analysis_started_at: new Date().toISOString(),
      })
      .select("id").single();

    if (insertErr || !savedCard) {
      console.error("[identify-card] insert failed:", insertErr);
      return new Response(JSON.stringify({ error: "Failed to create card" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Deduct credit
    if (!isPro) {
      const { data: remaining } = await supabaseAdmin.rpc("deduct_credit", { _user_id: user.id });
      if (remaining !== -1) {
        await supabaseAdmin.from("credit_transactions").insert({
          user_id: user.id, amount: -1, type: "scan",
          description: `AI scan: card ${savedCard.id}`,
        });
      }
    }

    // Fire-and-forget enrichment — identify + pricing both run server-side.
    const enrichUrl = `${supabaseUrl}/functions/v1/enrich-card`;
    const enrichPromise = fetch(enrichUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        cardId: savedCard.id,
        images,
        category,
        fastScan: body.fastScan === true,
      }),
    }).catch((err) => console.error("[identify-card] enrich dispatch failed:", err));

    // @ts-ignore - EdgeRuntime exists in Deno Deploy
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(enrichPromise);
    }

    console.log(`[identify-card] dispatched card=${savedCard.id} user=${user.id}`);

    return new Response(JSON.stringify({
      cardId: savedCard.id,
      analysisStatus: "identifying",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: any) {
    console.error("Error in identify-card:", error);
    return new Response(JSON.stringify({ error: error?.message || "Scan start failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
