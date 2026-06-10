import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getMarketData, type CardIdentification } from "../_shared/marketData.ts";
import { computeMarketConfidence } from "../_shared/confidence.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

// Strip markdown fences + control characters, then isolate the JSON object.
const CONTROL_CHARS = new RegExp("[\\u0000-\\u001F\\u007F]", "g");
function extractJsonObject(text: string): any {
  let jsonStr = text.trim()
    .replace(/^```(?:json|JSON)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .replace(CONTROL_CHARS, " ")
    .trim();
  const first = jsonStr.indexOf("{");
  const last = jsonStr.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) jsonStr = jsonStr.slice(first, last + 1);
  jsonStr = jsonStr.replace(/,\s*([}\]])/g, "$1");
  return JSON.parse(jsonStr);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const COLLECTAI_API_KEY = Deno.env.get("COLLECTAI_API_KEY");
    const apiKey = req.headers.get("x-api-key");
    const authHeader = req.headers.get("Authorization");

    const hasApiKey = apiKey && COLLECTAI_API_KEY && apiKey === COLLECTAI_API_KEY;
    const hasBearerToken = authHeader?.startsWith("Bearer ");

    if (!hasApiKey && !hasBearerToken) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Invalid or missing authentication" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let authenticatedUserId: string | null = null;

    if (!hasApiKey && hasBearerToken) {
      const { createClient } = await import("npm:@supabase/supabase-js@2");
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader! } },
      });
      const { data: userData, error: authError } = await supabase.auth.getUser();
      if (authError || !userData?.user) {
        return new Response(
          JSON.stringify({ error: "Unauthorized: Invalid token" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      authenticatedUserId = userData.user.id;

      // Rate limit: max 10 price lookups per hour for authenticated users
      const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count } = await supabaseAdmin
        .from("credit_transactions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", authenticatedUserId)
        .eq("type", "price_lookup")
        .gte("created_at", oneHourAgo);

      if ((count ?? 0) >= 10) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Max 10 price lookups per hour." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Log this price lookup for rate limiting tracking
      await supabaseAdmin
        .from("credit_transactions")
        .insert({
          user_id: authenticatedUserId,
          amount: 0,
          type: "price_lookup",
          description: "Price lookup via Bearer token",
        });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const body = await req.json();
    let cardName = String(body.cardName || body.card_name || "").trim();
    let cardSet = String(body.cardSet || body.card_set || "").trim();
    let cardYear = String(body.cardYear || body.card_year || "").trim();
    const cardNumber = String(body.cardNumber || body.card_number || "").trim();
    const variant = String(body.variant || body.edition || "").trim();
    const rarity = String(body.rarity || "").trim();
    const condition = String(body.condition || body.condition_grade || "").trim();
    const category = String(body.category || "").trim();
    let imageUrl = String(body.imageUrl || body.image_url || "").trim();
    const cardId = String(body.cardId || body.card_id || "").trim();

    // Fallback: hydrate from DB when caller provided cardId but missing fields.
    if (cardId && (!cardName || !imageUrl) && authenticatedUserId) {
      try {
        const { createClient } = await import("npm:@supabase/supabase-js@2");
        const supabaseUrl2 = Deno.env.get("SUPABASE_URL")!;
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const admin = createClient(supabaseUrl2, serviceKey);
        const { data: card } = await admin
          .from("cards")
          .select("card_name, card_set, card_year, image_url, ai_analysis, user_id")
          .eq("id", cardId)
          .maybeSingle();
        if (card && card.user_id === authenticatedUserId) {
          const ai = (card.ai_analysis as any) || {};
          if (!cardName) cardName = String(card.card_name || ai.cardName || "").trim();
          if (!cardSet) cardSet = String(card.card_set || ai.cardSet || "").trim();
          if (!cardYear) cardYear = String(card.card_year || ai.cardYear || "").trim();
          if (!imageUrl && card.image_url && !String(card.image_url).startsWith("http")) {
            const { data: signed } = await admin.storage
              .from("card-images")
              .createSignedUrl(card.image_url, 3600);
            if (signed?.signedUrl) imageUrl = signed.signedUrl;
          }
        }
      } catch (err) {
        console.error("[collectai-price] DB hydrate failed:", err);
      }
    }

    if (!cardName && !imageUrl) {
      return new Response(
        JSON.stringify({ error: "Either cardName or imageUrl is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("MyCollectAI Price API called for:", cardName || "image-based lookup");

    // Source comps through the SHARED tiered engine: PriceCharting (catalog →
    // live API) first, then eBay sold/active + TCGPlayer via Firecrawl, with a
    // broad/fallback Firecrawl search only when PriceCharting misses and eBay is
    // sparse. Same path the in-app scan uses — one source of truth.
    const cardIdent: CardIdentification = {
      card_name: cardName,
      card_number: cardNumber || undefined,
      card_set: cardSet || undefined,
      card_year: cardYear || undefined,
      variant: variant || undefined,
      rarity: rarity || undefined,
    };

    const aggregated = cardName
      ? await getMarketData(cardIdent, category || undefined, false)
      : { sources: [], blended: null, crossReference: {}, summary: "", hasData: false, compTitles: [] };

    const marketData = aggregated.summary;

    const today = new Date().toISOString().split("T")[0];

    const systemPrompt = `You are an expert trading card market analyst. Today's date is ${today}.

CRITICAL PRICING INSTRUCTIONS:
${marketData ? `You are provided with REAL, multi-source market price data (PriceCharting + eBay sold/active + TCGPlayer), kept separate and attributed, plus a suggested blended value.

VALUATION FORMULA (MUST follow):
1. Anchor on the SUGGESTED BLENDED VALUE provided in the data.
2. Where PriceCharting and eBay sold cross-reference and AGREE, treat the value as well-supported.
3. Adjust ±15% based on condition.
4. Set estimatedValueLow = adjusted value × 0.85, estimatedValueHigh = adjusted value × 1.15.
5. If sold data shows cards at $100+, your estimate MUST reflect that — NOT $5-15.
Your estimates MUST match the real data provided.` : "You do NOT have real-time market data. Be conservative. Use wider price ranges and set confidence to 'low' if uncertain about current market prices."}

Respond in JSON format:
{
  "cardName": "string",
  "cardSet": "string",
  "cardYear": "string",
  "estimatedValueLow": number,
  "estimatedValueHigh": number,
  "valueCurrency": "USD",
  "ebayRecentSales": { "averagePrice": number, "lowPrice": number, "highPrice": number, "recentSalesCount": "string", "notableSales": ["array"] },
  "tcgplayerPrice": { "marketPrice": number, "lowPrice": number, "midPrice": number, "highPrice": number },
  "gradedValues": { "psa10": number, "psa9": number, "psa8": number, "bgs10": number, "bgs9_5": number },
  "valueTrend": "rising" | "stable" | "falling" | "unknown",
  "trendReason": "string",
  "priceFactors": ["array"],
  "confidence": "high" | "medium" | "low",
  "dataSource": "string"
}`;

    const userText = imageUrl
      ? `Identify this card and provide detailed current market pricing.${marketData}`
      : `Provide detailed market pricing for: ${cardName}${cardSet ? `, Set: ${cardSet}` : ""}${cardYear ? `, Year: ${cardYear}` : ""}${variant ? `, Variant: ${variant}` : ""}${rarity ? `, Rarity: ${rarity}` : ""}${condition ? `, Condition: ${condition}` : ""}${marketData}`;

    const userContent: any[] = [{ type: "text", text: userText }];

    if (imageUrl) {
      userContent.push({ type: "image_url", image_url: { url: imageUrl } });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI usage limit reached" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) throw new Error("No response from AI");

    let pricing;
    try {
      pricing = extractJsonObject(content);
    } catch (err) {
      console.error("Failed to parse pricing data:", err, content.slice(0, 500));
      return new Response(
        JSON.stringify({ error: "Failed to parse pricing data" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Gemini sanity-check verification against the real market data.
    if (marketData && pricing.estimatedValueLow != null) {
      try {
        const verifyPrompt = `Verify this trading card price estimate against real market data.

Card: ${cardName} (${cardSet || ""} ${cardYear || ""})
AI estimate: $${pricing.estimatedValueLow} - $${pricing.estimatedValueHigh}

${marketData}

If the estimate is wrong based on the data, correct it. Return ONLY JSON:
{"verified_low": number, "verified_high": number, "verification_note": "brief explanation"}`;

        const verifyResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-lite",
            messages: [{ role: "user", content: verifyPrompt }],
            response_format: { type: "json_object" },
          }),
        });

        if (verifyResp.ok) {
          const vData = await verifyResp.json();
          const vText = vData.choices?.[0]?.message?.content;
          if (vText) {
            try {
              const verified = extractJsonObject(vText);
              if (typeof verified.verified_low === "number" && typeof verified.verified_high === "number") {
                pricing.estimatedValueLow = verified.verified_low;
                pricing.estimatedValueHigh = verified.verified_high;
                pricing.verificationNote = verified.verification_note;
              }
            } catch (e) {
              console.error("Gemini verify parse failed:", e);
            }
          }
        }
      } catch (err) {
        console.error("Gemini verification failed:", err);
      }
    }

    // Ground the confidence in the real comp statistics via the SHARED scorer —
    // same implementation analyze-card / enrich-card use. Only override when we
    // actually pulled market data; otherwise keep the model's conservative call.
    if (aggregated.hasData) {
      const conf = computeMarketConfidence(aggregated);
      pricing.confidence = conf.band;
      pricing.confidenceReason = conf.explanation;
    }

    return new Response(
      JSON.stringify({
        success: true,
        source: "MyCollectAI",
        data: pricing,
        extractedMarketData: {
          sources: aggregated.sources,
          blended: aggregated.blended,
          crossReference: aggregated.crossReference,
        },
        noData: !aggregated.hasData,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in collectai-price:", error);
    return new Response(
      JSON.stringify({ error: "An error occurred during pricing analysis" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
