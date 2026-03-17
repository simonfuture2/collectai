import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Simple in-memory rate limiter: 3 scans per IP per hour
const ipMap = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = ipMap.get(ip);
  if (!entry || now > entry.resetAt) {
    ipMap.set(ip, { count: 1, resetAt: now + 3600_000 });
    return false;
  }
  if (entry.count >= 3) return true;
  entry.count++;
  return false;
}

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

// Helper: search eBay + TCGPlayer listings via Firecrawl for quick scan
async function quickMarketSearch(cardName: string, cardSet: string, cardYear: string): Promise<string> {
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
        body: JSON.stringify({ query, limit, tbs: "qdr:m" }),
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
      doSearch(`${searchTerm} sold site:ebay.com`, 6, "ebay.com"),
      doSearch(`${searchTerm} site:ebay.com`, 5, "ebay.com"),
      doSearch(`${searchTerm} price site:tcgplayer.com`, 4, "tcgplayer.com"),
    ]);

    const soldPrices: number[] = [];
    soldResults.slice(0, 5).forEach((r: any) => {
      const text = `${r.title || ""} ${r.description || ""} ${(r.markdown || "").substring(0, 600)}`;
      soldPrices.push(...extractPrices(text));
    });

    const activePrices: number[] = [];
    activeResults.slice(0, 4).forEach((r: any) => {
      const text = `${r.title || ""} ${r.description || ""} ${(r.markdown || "").substring(0, 600)}`;
      activePrices.push(...extractPrices(text));
    });

    const tcgPrices: number[] = [];
    tcgResults.slice(0, 4).forEach((r: any) => {
      const text = `${r.title || ""} ${r.description || ""} ${(r.markdown || "").substring(0, 600)}`;
      tcgPrices.push(...extractPrices(text));
    });

    if (soldPrices.length === 0 && activePrices.length === 0 && tcgPrices.length === 0) return "";

    const medianSold = median(soldPrices);
    const medianActive = median(activePrices);
    const medianTcg = median(tcgPrices);

    let summary = "\n\n## REAL MARKET PRICE DATA (from eBay + TCGPlayer, retrieved today)\n";
    if (soldPrices.length > 0) {
      summary += `eBay SOLD prices: ${soldPrices.map((p) => `$${p.toFixed(2)}`).join(", ")} | Median: $${medianSold.toFixed(2)}\n`;
    }
    if (activePrices.length > 0) {
      summary += `eBay ACTIVE prices: ${activePrices.map((p) => `$${p.toFixed(2)}`).join(", ")} | Median: $${medianActive.toFixed(2)}\n`;
    }
    if (tcgPrices.length > 0) {
      summary += `TCGPlayer prices: ${tcgPrices.map((p) => `$${p.toFixed(2)}`).join(", ")} | Median: $${medianTcg.toFixed(2)}\n`;
    }

    // Compute blended value
    const allMedians: { value: number; weight: number }[] = [];
    if (soldPrices.length > 0) allMedians.push({ value: medianSold, weight: 0.5 });
    if (tcgPrices.length > 0) allMedians.push({ value: medianTcg, weight: 0.3 });
    if (activePrices.length > 0) allMedians.push({ value: medianActive, weight: 0.2 });

    if (allMedians.length > 0) {
      const totalWeight = allMedians.reduce((s, m) => s + m.weight, 0);
      const blended = allMedians.reduce((s, m) => s + m.value * (m.weight / totalWeight), 0);
      summary += `SUGGESTED VALUE: $${blended.toFixed(2)} (eBay sold 50% + TCGPlayer 30% + eBay active 20%)\n`;
    }
    summary += "Your estimated_value_low and estimated_value_high MUST reflect these real prices.\n";
    return summary;
  } catch (err) {
    console.error("Quick market search failed:", err);
    return "";
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("cf-connecting-ip") ||
      "unknown";

    if (isRateLimited(clientIp)) {
      return new Response(
        JSON.stringify({ error: "Rate limit reached. You can scan up to 3 cards per hour. Sign up for unlimited scans!" }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { imageBase64 } = await req.json();
    if (!imageBase64 || typeof imageBase64 !== "string") {
      return new Response(
        JSON.stringify({ error: "imageBase64 is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (imageBase64.length > 7_000_000) {
      return new Response(
        JSON.stringify({ error: "Image too large. Max 5MB." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const mimeMatch = imageBase64.match(/^data:(image\/\w+);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");

    // ===== STEP 1: Quick identification =====
    console.log("Quick scan Step 1: Identifying card...");
    const idResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: "Identify this trading card. Return ONLY card_name, card_set, card_year as JSON.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Identify this card." },
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${cleanBase64}` } },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "identify_card",
              description: "Return the card identification.",
              parameters: {
                type: "object",
                properties: {
                  card_name: { type: "string" },
                  card_set: { type: "string" },
                  card_year: { type: "string" },
                },
                required: ["card_name", "card_set", "card_year"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "identify_card" } },
      }),
    });

    let cardId: { card_name: string; card_set: string; card_year: string } | null = null;
    if (idResponse.ok) {
      const idData = await idResponse.json();
      const toolCall = idData.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        cardId = JSON.parse(toolCall.function.arguments);
        console.log("Card identified:", cardId);
      }
    }

    // ===== STEP 2: Search eBay + TCGPlayer listings =====
    let marketContext = "";
    if (cardId?.card_name) {
      marketContext = await quickMarketSearch(cardId.card_name, cardId.card_set || "", cardId.card_year || "");
    }

    // ===== STEP 3: Full quick scan with market data =====
    const today = new Date().toISOString().split("T")[0];

    const systemPrompt = `You are a trading card identification and grading AI. Today's date is ${today}.

CRITICAL PRICING RULES:
${marketContext ? `You have REAL market price data (eBay sold + active listings AND TCGPlayer) with extracted dollar amounts below.

VALUATION FORMULA (MUST follow):
1. Use the eBay median SOLD price as your primary anchor (50% weight).
2. Use the TCGPlayer median price as secondary (30% weight).
3. Use the eBay median ACTIVE listing price as tertiary (20% weight).
4. Normalize weights to available sources and compute a weighted average.
5. Adjust ±15% based on card condition relative to the listings.
6. Set estimated_value_low = adjusted value × 0.85, estimated_value_high = adjusted value × 1.15.
7. If real prices show $100+, your estimate MUST be in that range — NOT $5-15.
Your estimates MUST match the real data provided.` : "You do NOT have real-time market data. Be CONSERVATIVE with value estimates. Provide wider ranges rather than confidently wrong narrow estimates. If unsure, set confidence below 50."}

Analyze the card image and return ONLY a JSON object with these fields:
- card_name: string (full card name)
- card_set: string (set/series name)  
- card_year: string (year)
- condition_grade: string (e.g. "NM 7", "MT 9", "EX 5")
- estimated_value_low: number (USD - ${marketContext ? "based on real market data" : "conservative low estimate"})
- estimated_value_high: number (USD - ${marketContext ? "based on real market data" : "conservative high estimate"})
- confidence: number (0-100, ${marketContext ? "higher since real data available" : "keep LOW if unsure about pricing"})
- category: string (e.g. "Pokémon", "Sports Card", "Yu-Gi-Oh!", "Magic: The Gathering")

Return ONLY valid JSON, no markdown, no explanation.`;

    const userText = marketContext
      ? `Identify this trading card, estimate its condition grade, and provide a market value range based on the real market data provided.${marketContext}`
      : "Identify this trading card, estimate its condition grade, and provide a market value range. Be conservative if unsure about current prices.";

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: userText },
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${cleanBase64}` } },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "quick_scan_result",
              description: "Return the quick scan result for a trading card.",
              parameters: {
                type: "object",
                properties: {
                  card_name: { type: "string" },
                  card_set: { type: "string" },
                  card_year: { type: "string" },
                  condition_grade: { type: "string" },
                  estimated_value_low: { type: "number" },
                  estimated_value_high: { type: "number" },
                  confidence: { type: "number" },
                  category: { type: "string" },
                },
                required: ["card_name", "card_set", "card_year", "condition_grade", "estimated_value_low", "estimated_value_high", "confidence", "category"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "quick_scan_result" } },
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      const text = await aiResponse.text();
      console.error("AI gateway error:", status, text);

      if (status === 429) {
        return new Response(
          JSON.stringify({ error: "AI service is busy. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (status === 402) {
        return new Response(
          JSON.stringify({ error: "Service temporarily unavailable." }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: "Failed to analyze card" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall?.function?.arguments) {
      console.error("Unexpected AI response:", JSON.stringify(aiData));
      return new Response(
        JSON.stringify({ error: "Could not identify this card. Try a clearer photo." }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("quick-scan error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
