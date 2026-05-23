import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

// Helper: extract dollar amounts from text, filtering noise
function extractPrices(text: string): number[] {
  const cleaned = text.replace(/\$[\d,]+\.?\d*\s*(shipping|ship|s\/h|postage|delivery)/gi, "");
  const matches = cleaned.match(/\$[\d,]+\.?\d*/g) || [];
  return matches
    .map((m) => parseFloat(m.replace(/[$,]/g, "")))
    .filter((n) => n > 0.99 && n < 100000);
}

// IQR-based outlier filtering
function filterOutliers(prices: number[]): number[] {
  if (prices.length < 4) return prices;
  const sorted = [...prices].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  const iqr = q3 - q1;
  return prices.filter((p) => p >= q1 - 1.5 * iqr && p <= q3 + 1.5 * iqr);
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function extractJsonObject(text: string): any {
  let jsonStr = text.trim()
    .replace(/^```(?:json|JSON)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .trim();
  const first = jsonStr.indexOf("{");
  const last = jsonStr.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) jsonStr = jsonStr.slice(first, last + 1);
  jsonStr = jsonStr.replace(/,\s*([}\]])/g, "$1");
  return JSON.parse(jsonStr);
}

interface MarketSourceData {
  source: string;
  median: number;
  low: number;
  high: number;
  count: number;
  prices: number[];
}

interface ExtractedMarketData {
  sources: MarketSourceData[];
  blended: { median: number; low: number; high: number } | null;
}

// Build search terms with specificity
function buildSearchTerms(cardName: string, cardSet: string, cardYear: string): { specific: string; broad: string } {
  const specific = `${cardName} ${cardSet} ${cardYear}`.trim();
  const broad = `${cardName} ${cardSet}`.trim();
  return { specific, broad };
}

async function searchMarketPrices(cardName: string, cardSet: string, cardYear: string): Promise<{ summary: string; extractedMarketData: ExtractedMarketData }> {
  const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
  const emptyMarket: ExtractedMarketData = { sources: [], blended: null };
  if (!FIRECRAWL_API_KEY) return { summary: "", extractedMarketData: emptyMarket };

  const { specific } = buildSearchTerms(cardName, cardSet, cardYear);

  async function doSearch(query: string, limit: number, urlFilter?: string) {
    try {
      const response = await fetch("https://api.firecrawl.dev/v1/search", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query, limit, tbs: "qdr:m", scrapeOptions: { formats: ["markdown"] } }),
      });
      if (!response.ok) return [];
      const data = await response.json();
      const results = data.data || [];
      return urlFilter ? results.filter((r: any) => r.url?.includes(urlFilter)) : results;
    } catch {
      return [];
    }
  }

  try {
    const [soldResults, activeResults, tcgResults] = await Promise.all([
      doSearch(`"${specific}" sold site:ebay.com`, 10, "ebay.com"),
      doSearch(`"${specific}" site:ebay.com`, 8, "ebay.com"),
      doSearch(`"${specific}" price site:tcgplayer.com`, 6, "tcgplayer.com"),
    ]);

    console.log(`Price API results: ${soldResults.length} eBay sold, ${activeResults.length} eBay active, ${tcgResults.length} TCGPlayer`);

    let soldPrices: number[] = [];
    soldResults.slice(0, 8).forEach((r: any) => {
      const text = `${r.title || ""} ${r.description || ""} ${(r.markdown || "").substring(0, 800)}`;
      soldPrices.push(...extractPrices(text));
    });
    soldPrices = filterOutliers(soldPrices);

    let activePrices: number[] = [];
    activeResults.slice(0, 6).forEach((r: any) => {
      const text = `${r.title || ""} ${r.description || ""} ${(r.markdown || "").substring(0, 800)}`;
      activePrices.push(...extractPrices(text));
    });
    activePrices = filterOutliers(activePrices);

    let tcgPrices: number[] = [];
    tcgResults.slice(0, 5).forEach((r: any) => {
      const text = `${r.title || ""} ${r.description || ""} ${(r.markdown || "").substring(0, 800)}`;
      tcgPrices.push(...extractPrices(text));
    });
    tcgPrices = filterOutliers(tcgPrices);

    if (soldPrices.length === 0 && activePrices.length === 0 && tcgPrices.length === 0) return { summary: "", extractedMarketData: emptyMarket };

    const medianSold = median(soldPrices);
    const medianActive = median(activePrices);
    const medianTcg = median(tcgPrices);

    const sources: MarketSourceData[] = [];
    if (soldPrices.length > 0) sources.push({ source: "ebay_sold", median: medianSold, low: Math.min(...soldPrices), high: Math.max(...soldPrices), count: soldPrices.length, prices: soldPrices });
    if (activePrices.length > 0) sources.push({ source: "ebay_active", median: medianActive, low: Math.min(...activePrices), high: Math.max(...activePrices), count: activePrices.length, prices: activePrices });
    if (tcgPrices.length > 0) sources.push({ source: "tcgplayer", median: medianTcg, low: Math.min(...tcgPrices), high: Math.max(...tcgPrices), count: tcgPrices.length, prices: tcgPrices });

    const allMedians: { value: number; weight: number }[] = [];
    if (soldPrices.length > 0) allMedians.push({ value: medianSold, weight: 0.5 });
    if (tcgPrices.length > 0) allMedians.push({ value: medianTcg, weight: 0.3 });
    if (activePrices.length > 0) allMedians.push({ value: medianActive, weight: 0.2 });

    let blended: ExtractedMarketData["blended"] = null;
    let summary = "\n\n## REAL MARKET PRICE DATA (from eBay + TCGPlayer, retrieved today)\n";
    summary += `Card searched: ${specific}\n`;
    
    if (soldPrices.length > 0) {
      summary += `\neBay SOLD (last 30 days):\n`;
      summary += `- Filtered prices: ${soldPrices.map((p) => `$${p.toFixed(2)}`).join(", ")}\n`;
      summary += `- Median sold: $${medianSold.toFixed(2)} | Range: $${Math.min(...soldPrices).toFixed(2)} - $${Math.max(...soldPrices).toFixed(2)}\n`;
    }
    if (activePrices.length > 0) {
      summary += `\neBay ACTIVE:\n`;
      summary += `- Filtered prices: ${activePrices.map((p) => `$${p.toFixed(2)}`).join(", ")}\n`;
      summary += `- Median asking: $${medianActive.toFixed(2)} | Range: $${Math.min(...activePrices).toFixed(2)} - $${Math.max(...activePrices).toFixed(2)}\n`;
    }
    if (tcgPrices.length > 0) {
      summary += `\nTCGPlayer:\n`;
      summary += `- Filtered prices: ${tcgPrices.map((p) => `$${p.toFixed(2)}`).join(", ")}\n`;
      summary += `- Median: $${medianTcg.toFixed(2)} | Range: $${Math.min(...tcgPrices).toFixed(2)} - $${Math.max(...tcgPrices).toFixed(2)}\n`;
    }

    if (allMedians.length > 0) {
      const totalWeight = allMedians.reduce((s, m) => s + m.weight, 0);
      const blendedMedian = allMedians.reduce((s, m) => s + m.value * (m.weight / totalWeight), 0);
      const allPrices = [...soldPrices, ...activePrices, ...tcgPrices];
      blended = { median: blendedMedian, low: Math.min(...allPrices), high: Math.max(...allPrices) };
      summary += `\nSUGGESTED BLENDED VALUE: $${blendedMedian.toFixed(2)} (eBay sold 50% + TCGPlayer 30% + eBay active 20%)\n`;
    }
    summary += "\nCRITICAL: Your estimatedValueLow/High MUST be within the range of these real prices.\n";
    return { summary, extractedMarketData: { sources, blended } };
  } catch (err) {
    console.error("Price market search failed:", err);
    return { summary: "", extractedMarketData: emptyMarket };
  }
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

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

    const body = await req.json();
    const cardName = String(body.cardName || body.card_name || "").trim();
    const cardSet = String(body.cardSet || body.card_set || "").trim();
    const cardYear = String(body.cardYear || body.card_year || "").trim();
    const edition = String(body.edition || "").trim();
    const rarity = String(body.rarity || "").trim();
    const condition = String(body.condition || body.condition_grade || "").trim();
    const imageUrl = String(body.imageUrl || body.image_url || "").trim();

    if (!cardName && !imageUrl) {
      return new Response(
        JSON.stringify({ error: "Either cardName or imageUrl is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("CollectAI Price API called for:", cardName || "image-based lookup");

    let marketResult = { summary: "", extractedMarketData: { sources: [], blended: null } as ExtractedMarketData };
    if (cardName) {
      marketResult = await searchMarketPrices(cardName, cardSet || "", cardYear || "");
    }
    const marketData = marketResult.summary;

    const today = new Date().toISOString().split("T")[0];

    const systemPrompt = `You are an expert trading card market analyst. Today's date is ${today}.

CRITICAL PRICING INSTRUCTIONS:
${marketData ? `You are provided with REAL market price data from eBay (sold + active) AND TCGPlayer with extracted dollar amounts.

VALUATION FORMULA (MUST follow):
1. Use the eBay median SOLD price as primary anchor (50% weight).
2. Use the TCGPlayer median price as secondary (30% weight).
3. Use the eBay median ACTIVE listing price as tertiary (20% weight).
4. Normalize weights to available sources. Adjust ±15% based on condition.
5. Set estimatedValueLow = adjusted value × 0.85, estimatedValueHigh = adjusted value × 1.15.
6. If sold data shows cards at $100+, your estimate MUST reflect that — NOT $5-15.
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
      : `Provide detailed market pricing for: ${cardName}${cardSet ? `, Set: ${cardSet}` : ""}${cardYear ? `, Year: ${cardYear}` : ""}${edition ? `, Edition: ${edition}` : ""}${rarity ? `, Rarity: ${rarity}` : ""}${condition ? `, Condition: ${condition}` : ""}${marketData}`;

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

    // Claude verification if available
    if (ANTHROPIC_API_KEY && marketData && pricing.estimatedValueLow != null) {
      try {
        console.log("Running Claude price verification for API...");
        const verifyPrompt = `Verify this trading card price estimate against real market data.

Card: ${cardName} (${cardSet || ""} ${cardYear || ""})
AI estimate: $${pricing.estimatedValueLow} - $${pricing.estimatedValueHigh}

${marketData}

If the estimate is wrong based on the data, correct it. Return ONLY JSON:
{"verified_low": number, "verified_high": number, "verification_note": "brief explanation"}`;

        const claudeResp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 512,
            messages: [{ role: "user", content: verifyPrompt }],
          }),
        });

        if (claudeResp.ok) {
          const claudeData = await claudeResp.json();
          const claudeText = claudeData.content?.[0]?.text;
          if (claudeText) {
            const match = claudeText.match(/\{[\s\S]*\}/);
            if (match) {
              const verified = JSON.parse(match[0]);
              pricing.estimatedValueLow = verified.verified_low;
              pricing.estimatedValueHigh = verified.verified_high;
              pricing.verificationNote = verified.verification_note;
              console.log("Claude verified:", verified.verification_note);
            }
          }
        }
      } catch (err) {
        console.error("Claude verification failed:", err);
      }
    }

    return new Response(
      JSON.stringify({ success: true, source: "CollectAI", data: pricing, extractedMarketData: marketResult.extractedMarketData }),
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
