import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

// Helper: extract dollar amounts from text
function extractPrices(text: string): number[] {
  const matches = text.match(/\$[\d,]+\.?\d*/g) || [];
  return matches
    .map((m) => parseFloat(m.replace(/[$,]/g, "")))
    .filter((n) => n > 0.5 && n < 100000);
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Helper: search eBay + TCGPlayer via Firecrawl
async function searchMarketPrices(cardName: string, cardSet: string, cardYear: string): Promise<string> {
  const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
  if (!FIRECRAWL_API_KEY) return "";

  const searchTerm = `${cardName} ${cardSet} ${cardYear}`.trim();

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
      doSearch(`${searchTerm} sold site:ebay.com`, 10, "ebay.com"),
      doSearch(`${searchTerm} site:ebay.com`, 8, "ebay.com"),
      doSearch(`${searchTerm} price site:tcgplayer.com`, 6, "tcgplayer.com"),
    ]);

    console.log(`Price API results: ${soldResults.length} eBay sold, ${activeResults.length} eBay active, ${tcgResults.length} TCGPlayer`);

    const soldPrices: number[] = [];
    soldResults.slice(0, 8).forEach((r: any) => {
      const text = `${r.title || ""} ${r.description || ""} ${(r.markdown || "").substring(0, 800)}`;
      soldPrices.push(...extractPrices(text));
    });

    const activePrices: number[] = [];
    activeResults.slice(0, 6).forEach((r: any) => {
      const text = `${r.title || ""} ${r.description || ""} ${(r.markdown || "").substring(0, 800)}`;
      activePrices.push(...extractPrices(text));
    });

    const tcgPrices: number[] = [];
    tcgResults.slice(0, 5).forEach((r: any) => {
      const text = `${r.title || ""} ${r.description || ""} ${(r.markdown || "").substring(0, 800)}`;
      tcgPrices.push(...extractPrices(text));
    });

    if (soldPrices.length === 0 && activePrices.length === 0 && tcgPrices.length === 0) return "";

    const medianSold = median(soldPrices);
    const medianActive = median(activePrices);
    const medianTcg = median(tcgPrices);

    let summary = "\n\n## REAL MARKET PRICE DATA (from eBay + TCGPlayer, retrieved today)\n";
    if (soldPrices.length > 0) {
      summary += `\neBay SOLD (last 30 days):\n`;
      summary += `- Prices: ${soldPrices.map((p) => `$${p.toFixed(2)}`).join(", ")}\n`;
      summary += `- Median sold: $${medianSold.toFixed(2)} | Range: $${Math.min(...soldPrices).toFixed(2)} - $${Math.max(...soldPrices).toFixed(2)}\n`;
    }
    if (activePrices.length > 0) {
      summary += `\neBay ACTIVE:\n`;
      summary += `- Prices: ${activePrices.map((p) => `$${p.toFixed(2)}`).join(", ")}\n`;
      summary += `- Median asking: $${medianActive.toFixed(2)} | Range: $${Math.min(...activePrices).toFixed(2)} - $${Math.max(...activePrices).toFixed(2)}\n`;
    }
    if (tcgPrices.length > 0) {
      summary += `\nTCGPlayer:\n`;
      summary += `- Prices: ${tcgPrices.map((p) => `$${p.toFixed(2)}`).join(", ")}\n`;
      summary += `- Median: $${medianTcg.toFixed(2)} | Range: $${Math.min(...tcgPrices).toFixed(2)} - $${Math.max(...tcgPrices).toFixed(2)}\n`;
    }

    const allMedians: { value: number; weight: number }[] = [];
    if (soldPrices.length > 0) allMedians.push({ value: medianSold, weight: 0.5 });
    if (tcgPrices.length > 0) allMedians.push({ value: medianTcg, weight: 0.3 });
    if (activePrices.length > 0) allMedians.push({ value: medianActive, weight: 0.2 });

    if (allMedians.length > 0) {
      const totalWeight = allMedians.reduce((s, m) => s + m.weight, 0);
      const blended = allMedians.reduce((s, m) => s + m.value * (m.weight / totalWeight), 0);
      summary += `\nSUGGESTED BLENDED VALUE: $${blended.toFixed(2)} (eBay sold 50% + TCGPlayer 30% + eBay active 20%)\n`;
    }
    summary += "\nCRITICAL: Your estimatedValueLow/High MUST be within the range of these real prices.\n";
    return summary;
  } catch (err) {
    console.error("Price market search failed:", err);
    return "";
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const COLLECTAI_API_KEY = Deno.env.get("COLLECTAI_API_KEY");
    if (!COLLECTAI_API_KEY) {
      throw new Error("COLLECTAI_API_KEY is not configured");
    }

    const apiKey = req.headers.get("x-api-key");
    if (!apiKey || apiKey !== COLLECTAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Invalid or missing API key" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const { cardName, cardSet, cardYear, edition, rarity, condition, imageUrl } = await req.json();

    if (!cardName && !imageUrl) {
      return new Response(
        JSON.stringify({ error: "Either cardName or imageUrl is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("CollectAI Price API called for:", cardName || "image-based lookup");

    // Search eBay + TCGPlayer for real pricing data
    let marketData = "";
    if (cardName) {
      marketData = await searchMarketPrices(cardName, cardSet || "", cardYear || "");
    }

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
  "ebayRecentSales": {
    "averagePrice": number,
    "lowPrice": number,
    "highPrice": number,
    "recentSalesCount": "string",
    "notableSales": ["array"]
  },
  "tcgplayerPrice": {
    "marketPrice": number,
    "lowPrice": number,
    "midPrice": number,
    "highPrice": number
  },
  "gradedValues": {
    "psa10": number,
    "psa9": number,
    "psa8": number,
    "bgs10": number,
    "bgs9_5": number
  },
  "valueTrend": "rising" | "stable" | "falling" | "unknown",
  "trendReason": "string",
  "priceFactors": ["array of factors"],
  "confidence": "high" | "medium" | "low",
  "dataSource": "string describing where pricing data came from"
}`;

    const userText = imageUrl
      ? `Identify this card and provide detailed current market pricing.${ebayData}`
      : `Provide detailed market pricing for: ${cardName}${cardSet ? `, Set: ${cardSet}` : ""}${cardYear ? `, Year: ${cardYear}` : ""}${edition ? `, Edition: ${edition}` : ""}${rarity ? `, Rarity: ${rarity}` : ""}${condition ? `, Condition: ${condition}` : ""}${ebayData}`;

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
      const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/) || content.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
      pricing = JSON.parse(jsonStr);
    } catch {
      return new Response(
        JSON.stringify({ error: "Failed to parse pricing data" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, source: "CollectAI", data: pricing }),
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
