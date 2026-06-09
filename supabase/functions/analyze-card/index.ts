// Thin HTTP wrapper around the shared analysis engine.
// Responsibilities: auth, signed-URL validation, rate limit, credit check,
// then call runAnalysis(), then persist (cards + price_history), then deduct credit.
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { runAnalysis } from "../_shared/analysisEngine.ts";
import { buildPriceHistoryRows } from "../_shared/marketData.ts";
import { computePriceTrend } from "../_shared/priceTrend.ts";
import { buildRecommendation } from "../_shared/recommendation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized - missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseAnonKey) throw new Error("Server configuration error");

    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid authentication" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log("Authenticated user:", user.id);

    const supabaseAdmin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "");

    // Rate limit: max 10 scans per hour per user
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recentScans } = await supabaseAdmin
      .from("credit_transactions")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("type", "scan")
      .gte("created_at", oneHourAgo);

    if ((recentScans ?? 0) >= 10) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded — max 10 scans per hour. Please try again later." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: creditsData } = await supabaseAdmin
      .from("user_credits")
      .select("credits, plan")
      .eq("user_id", user.id)
      .single();

    const isPro = creditsData?.plan === "pro";
    const hasCredits = (creditsData?.credits ?? 0) > 0;

    if (!isPro && !hasCredits) {
      return new Response(
        JSON.stringify({ error: "Insufficient credits. Please purchase credits or upgrade to Pro." }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json();

    const images: { label: string; url: string }[] = body.images || [];
    if (images.length === 0 && body.imageUrl) {
      images.push({ label: "Front", url: body.imageUrl });
    }

    if (images.length === 0) {
      return new Response(
        JSON.stringify({ error: "At least one image is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Validate all URLs
    const ALLOWED_BUCKET = "card-images";
    const signedUrlPattern = `${supabaseUrl}/storage/v1/object/sign/${ALLOWED_BUCKET}/`;

    for (const img of images) {
      if (!img.url.startsWith(signedUrlPattern)) {
        return new Response(
          JSON.stringify({ error: `Invalid image URL for "${img.label}" - must be from card-images bucket` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    const validExtensions = [".jpg", ".jpeg", ".png", ".gif", ".webp"];
    for (const img of images) {
      try {
        const url = new URL(img.url);
        const pathParts = url.pathname.split("/");
        const bucketIndex = pathParts.indexOf("card-images");
        if (bucketIndex === -1 || bucketIndex + 1 >= pathParts.length) throw new Error("Invalid path");
        const imageUserId = pathParts[bucketIndex + 1];
        if (imageUserId !== user.id) {
          return new Response(
            JSON.stringify({ error: "Unauthorized - can only analyze your own images" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        const urlPath = url.pathname.toLowerCase();
        if (!validExtensions.some((ext) => urlPath.includes(ext))) {
          return new Response(
            JSON.stringify({ error: `Invalid file type for "${img.label}" - must be an image` }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      } catch (_urlParseError) {
        return new Response(
          JSON.stringify({ error: "Invalid image URL format" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    console.log(`Analyzing ${images.length} image(s) for user:`, user.id);

    // ===== Run the shared analysis pipeline =====
    let engineResult;
    try {
      engineResult = await runAnalysis({
        images,
        category: body.category,
        fastScan: body.fastScan === true,
      });
    } catch (err: any) {
      console.error("[analyze-card] runAnalysis failed:", err);
      const msg = String(err?.message || "");
      if (msg.includes("Claude API error: 429")) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      throw err;
    }

    const { analysis, marketData: aggregated } = engineResult;
    const extractedMarketData = {
      sources: aggregated.sources,
      blended: aggregated.blended,
      crossReference: aggregated.crossReference,
    };

    // ===== STEP 5: Save card server-side, then deduct credit =====
    const firstImageUrl = images[0]?.url || "";
    let imagePath = "";
    try {
      const urlObj = new URL(firstImageUrl);
      const pathParts = urlObj.pathname.split("/");
      const bucketIndex = pathParts.indexOf("card-images");
      if (bucketIndex !== -1) {
        imagePath = pathParts.slice(bucketIndex + 1).join("/");
      }
    } catch {
      imagePath = "";
    }
    if (!imagePath) imagePath = body.filePath || firstImageUrl;

    // Duplicate prevention
    const { data: existingCard } = await supabaseAdmin
      .from("cards")
      .select("id")
      .eq("user_id", user.id)
      .eq("image_url", imagePath)
      .maybeSingle();

    if (existingCard) {
      console.log("Duplicate card detected, returning existing card:", existingCard.id);
      return new Response(
        JSON.stringify({ ...analysis, extractedMarketData, cardId: existingCard.id, duplicate: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Insert card
    const { data: savedCard, error: cardInsertError } = await supabaseAdmin
      .from("cards")
      .insert({
        user_id: user.id,
        image_url: imagePath,
        category: analysis.category || "Trading Card",
        card_name: analysis.cardName || null,
        card_set: analysis.cardSet || null,
        card_year: analysis.cardYear || null,
        edition: analysis.edition || null,
        rarity: analysis.rarity || null,
        condition_grade: analysis.conditionGrade || null,
        special_features: analysis.specialFeatures || [],
        estimated_value_low: analysis.estimatedValueLow || null,
        estimated_value_high: analysis.estimatedValueHigh || null,
        ebay_recent_sales: analysis.ebayRecentSales || null,
        tcgplayer_price: analysis.tcgplayerPrice || null,
        psa_population_data: analysis.psaPopulation || null,
        ai_analysis: analysis,
        last_scanned_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (cardInsertError) {
      console.error("Failed to save card:", cardInsertError);
      return new Response(
        JSON.stringify({ ...analysis, extractedMarketData, saveError: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log("Card saved server-side:", savedCard.id);

    // Insert price history
    const priceRows = buildPriceHistoryRows(aggregated, savedCard.id, user.id);
    if (priceRows.length > 0) {
      await supabaseAdmin.from("price_history").insert(priceRows);
    }

    // ===== STEP 6: Real price trend =====
    try {
      const trend = await computePriceTrend(supabaseAdmin, savedCard.id);
      analysis.priceTrend = trend;
      console.log(
        `[priceTrend] ${trend.status} dir=${trend.direction ?? "-"} 30d=${trend.change30dPct ?? "-"}% 90d=${trend.change90dPct ?? "-"}% n=${trend.sampleSize} src=${trend.source}`,
      );
    } catch (err) {
      console.error("[priceTrend] failed:", (err as Error)?.message);
    }

    // ===== STEP 7: Deterministic recommendation =====
    try {
      const rec = buildRecommendation({
        trend: analysis.priceTrend ?? null,
        gradingEdge: analysis.gradingEdge ?? null,
        confidenceBand: analysis.confidenceBand ?? null,
      });
      analysis.recommendation = rec;
      console.log(`[recommendation] ${rec.action} — ${rec.rationale}`);
    } catch (err) {
      console.error("[recommendation] failed:", (err as Error)?.message);
    }

    // Persist trend + recommendation together
    try {
      await supabaseAdmin
        .from("cards")
        .update({ ai_analysis: analysis })
        .eq("id", savedCard.id);
    } catch (err) {
      console.error("[persist analysis] failed:", (err as Error)?.message);
    }

    // Deduct credit (only after card is saved)
    if (!isPro) {
      const { data: remaining, error: deductError } = await supabaseAdmin.rpc("deduct_credit", {
        _user_id: user.id,
      });

      if (deductError || remaining === -1) {
        console.error("Credit deduction failed after save - card already persisted");
      } else {
        await supabaseAdmin.from("credit_transactions").insert({
          user_id: user.id,
          amount: -1,
          type: "scan",
          description: `AI scan: ${analysis.cardName || "Unknown card"}`,
        });
        console.log("Deducted 1 credit for user:", user.id, "remaining:", remaining);
      }
    }

    return new Response(
      JSON.stringify({ ...analysis, extractedMarketData, cardId: savedCard.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error in analyze-card function:", error);
    return new Response(
      JSON.stringify({ error: "An error occurred while analyzing the card" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
