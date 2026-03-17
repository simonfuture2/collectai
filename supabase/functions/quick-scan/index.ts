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

// Helper: extract dollar amounts from text, filtering noise
function extractPrices(text: string): number[] {
  // Remove shipping-related prices
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

interface CardIdentification {
  card_name: string;
  card_number: string;
  card_set: string;
  card_year: string;
  variant: string;
  rarity: string;
}

// Build specific search queries from card identification
function buildSearchTerms(cardId: CardIdentification): { specific: string; broad: string; variant: string } {
  const parts: string[] = [];
  if (cardId.card_name) parts.push(cardId.card_name);
  if (cardId.card_number) parts.push(cardId.card_number);
  if (cardId.variant && cardId.variant !== "Regular" && cardId.variant !== "Standard") parts.push(cardId.variant);
  
  const specific = parts.join(" ");
  const broad = `${cardId.card_name} ${cardId.card_set || ""} ${cardId.variant || ""}`.trim();
  // Variant-focused: just name + variant for maximum recall
  const variant = `${cardId.card_name} ${cardId.variant && cardId.variant !== "Regular" ? cardId.variant : ""} pokemon card`.trim();
  
  return { specific, broad, variant };
}

// Extract blended value from market context string
function extractBlendedValue(marketCtx: string): number {
  const match = marketCtx.match(/SUGGESTED VALUE: \$([\d.]+)/);
  return match ? parseFloat(match[1]) : 0;
}

// Helper: search eBay + TCGPlayer listings via Firecrawl for quick scan
async function quickMarketSearch(cardId: CardIdentification): Promise<string> {
  const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
  if (!FIRECRAWL_API_KEY) return "";

  const { specific, broad, variant } = buildSearchTerms(cardId);

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
    // Try specific search first
    let [soldResults, activeResults, tcgResults] = await Promise.all([
      doSearch(`"${specific}" sold site:ebay.com`, 8, "ebay.com"),
      doSearch(`"${specific}" site:ebay.com`, 6, "ebay.com"),
      doSearch(`"${specific}" price site:tcgplayer.com`, 5, "tcgplayer.com"),
    ]);

    // Fallback to broader search if specific returned nothing
    let totalSpecific = soldResults.length + activeResults.length + tcgResults.length;
    if (totalSpecific < 3 && broad !== specific) {
      console.log("Specific search yielded few results, trying broader search...");
      const [soldBroad, activeBroad, tcgBroad] = await Promise.all([
        doSearch(`${broad} sold site:ebay.com`, 8, "ebay.com"),
        doSearch(`${broad} site:ebay.com`, 6, "ebay.com"),
        doSearch(`${broad} price site:tcgplayer.com`, 5, "tcgplayer.com"),
      ]);
      const totalBroad = soldBroad.length + activeBroad.length + tcgBroad.length;
      if (totalBroad > totalSpecific) {
        soldResults = soldBroad;
        activeResults = activeBroad;
        tcgResults = tcgBroad;
        totalSpecific = totalBroad;
      }
    }

    // Variant-focused fallback: unquoted, simpler terms for maximum recall
    if (totalSpecific < 3 && variant) {
      console.log("Still sparse, trying variant-focused search:", variant);
      const [soldVar, activeVar, tcgVar] = await Promise.all([
        doSearch(`${variant} sold site:ebay.com`, 8, "ebay.com"),
        doSearch(`${variant} site:ebay.com`, 6, "ebay.com"),
        doSearch(`${variant} price site:tcgplayer.com`, 5, "tcgplayer.com"),
      ]);
      const totalVar = soldVar.length + activeVar.length + tcgVar.length;
      if (totalVar > totalSpecific) {
        soldResults = soldVar;
        activeResults = activeVar;
        tcgResults = tcgVar;
      }
    }

    console.log(`Quick scan market results: ${soldResults.length} eBay sold, ${activeResults.length} eBay active, ${tcgResults.length} TCGPlayer`);

    let soldPrices: number[] = [];
    soldResults.slice(0, 6).forEach((r: any) => {
      const text = `${r.title || ""} ${r.description || ""} ${(r.markdown || "").substring(0, 800)}`;
      soldPrices.push(...extractPrices(text));
    });
    soldPrices = filterOutliers(soldPrices);

    let activePrices: number[] = [];
    activeResults.slice(0, 5).forEach((r: any) => {
      const text = `${r.title || ""} ${r.description || ""} ${(r.markdown || "").substring(0, 800)}`;
      activePrices.push(...extractPrices(text));
    });
    activePrices = filterOutliers(activePrices);

    let tcgPrices: number[] = [];
    tcgResults.slice(0, 4).forEach((r: any) => {
      const text = `${r.title || ""} ${r.description || ""} ${(r.markdown || "").substring(0, 800)}`;
      tcgPrices.push(...extractPrices(text));
    });
    tcgPrices = filterOutliers(tcgPrices);

    if (soldPrices.length === 0 && activePrices.length === 0 && tcgPrices.length === 0) return "";

    const medianSold = median(soldPrices);
    const medianActive = median(activePrices);
    const medianTcg = median(tcgPrices);

    let summary = "\n\n## REAL MARKET PRICE DATA (from eBay + TCGPlayer, retrieved today)\n";
    summary += `Card searched: ${specific}\n`;
    if (soldPrices.length > 0) {
      summary += `eBay SOLD prices (filtered): ${soldPrices.map((p) => `$${p.toFixed(2)}`).join(", ")} | Median: $${medianSold.toFixed(2)}\n`;
    }
    if (activePrices.length > 0) {
      summary += `eBay ACTIVE prices (filtered): ${activePrices.map((p) => `$${p.toFixed(2)}`).join(", ")} | Median: $${medianActive.toFixed(2)}\n`;
    }
    if (tcgPrices.length > 0) {
      summary += `TCGPlayer prices (filtered): ${tcgPrices.map((p) => `$${p.toFixed(2)}`).join(", ")} | Median: $${medianTcg.toFixed(2)}\n`;
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

// Claude verification of pricing
async function verifyWithClaude(
  cardId: CardIdentification,
  estimatedLow: number,
  estimatedHigh: number,
  marketContext: string,
  ANTHROPIC_API_KEY: string
): Promise<{ verified_low: number; verified_high: number; verification_note: string } | null> {
  try {
    console.log("Running Claude price verification...");
    const prompt = `You are a trading card price verification expert. Verify this estimate against the real market data.

Card: ${cardId.card_name} ${cardId.card_number || ""} ${cardId.variant || ""} (${cardId.card_set || ""} ${cardId.card_year || ""})

AI estimated value: $${estimatedLow.toFixed(2)} - $${estimatedHigh.toFixed(2)}

${marketContext}

TASK: Based ONLY on the real market data above, determine the correct value range for this card in raw Near Mint condition. 
- If the AI estimate is wildly wrong (e.g., $5-50 when data shows $100+), CORRECT IT.
- Your verified_low should be approximately the blended value × 0.85
- Your verified_high should be approximately the blended value × 1.15
- If no real data is available, return the AI's original estimate.

Return ONLY valid JSON:
{"verified_low": number, "verified_high": number, "verification_note": "brief explanation"}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 512,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      console.error("Claude verification failed:", response.status);
      return null;
    }

    const data = await response.json();
    const text = data.content?.[0]?.text;
    if (!text) return null;

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error("Claude verification error:", err);
    return null;
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

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

    const mimeMatch = imageBase64.match(/^data:(image\/\w+);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");

    // ===== STEP 1: Detailed identification with Gemini 2.5 Pro =====
    console.log("Quick scan Step 1: Identifying card with Pro model...");
    const idResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          {
            role: "system",
            content: `You are a trading card identification expert. Look at this card image VERY carefully. Read ALL text on the card including:
- The card name (character/player name)
- The card NUMBER (e.g., "105/086", "PSA 10", etc.) - look at bottom of card
- The set/series name and any set symbols
- The year of release
- The variant type (Illustration Rare, Full Art, Alt Art, Holo, Reverse Holo, Regular, etc.)
- The rarity symbol and level

Be EXTREMELY specific. Do NOT return generic names. Include the card number and variant type.`,
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Identify this trading card with maximum specificity. Read the card number, variant type, and all visible text." },
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${cleanBase64}` } },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "identify_card",
              description: "Return the detailed card identification.",
              parameters: {
                type: "object",
                properties: {
                  card_name: { type: "string", description: "Full character/player name on the card" },
                  card_number: { type: "string", description: "Card number as printed (e.g., '105/086', '25/198'). Empty string if not visible." },
                  card_set: { type: "string", description: "Full set/series name (e.g., 'Scarlet & Violet: Black Bolt', NOT abbreviated)" },
                  card_year: { type: "string", description: "Year of release" },
                  variant: { type: "string", description: "Variant/parallel type: 'Illustration Rare', 'Full Art', 'Alt Art', 'Holo', 'Reverse Holo', 'Regular', 'Secret Rare', 'Gold', etc." },
                  rarity: { type: "string", description: "Rarity level: Common, Uncommon, Rare, Ultra Rare, Secret Rare, etc." },
                },
                required: ["card_name", "card_number", "card_set", "card_year", "variant", "rarity"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "identify_card" } },
      }),
    });

    let cardId: CardIdentification | null = null;
    if (idResponse.ok) {
      const idData = await idResponse.json();
      const toolCall = idData.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        cardId = JSON.parse(toolCall.function.arguments);
        console.log("Card identified (detailed):", JSON.stringify(cardId));
      }
    }

    // ===== STEP 2: Search eBay + TCGPlayer with specific details =====
    let marketContext = "";
    if (cardId?.card_name) {
      marketContext = await quickMarketSearch(cardId);
    }

    // ===== STEP 3: Full quick scan with market data using Gemini Pro =====
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
- card_name: string (full card name including any variant designation)
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
        model: "google/gemini-2.5-pro",
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
    console.log(`Gemini raw estimate: $${result.estimated_value_low}-$${result.estimated_value_high}, confidence: ${result.confidence}`);

    // ===== STEP 4: PROGRAMMATIC PRICE OVERRIDE from market data =====
    const blendedValue = extractBlendedValue(marketContext);
    if (blendedValue > 0) {
      const origLow = result.estimated_value_low;
      const origHigh = result.estimated_value_high;
      result.estimated_value_low = Math.round(blendedValue * 0.85);
      result.estimated_value_high = Math.round(blendedValue * 1.15);
      result.confidence = Math.min(95, Math.max(result.confidence, 75));
      console.log(`Programmatic override: blended=$${blendedValue.toFixed(2)}, $${origLow}-$${origHigh} → $${result.estimated_value_low}-$${result.estimated_value_high}`);
    } else {
      console.log("No blended value available — using Gemini estimate as-is");
    }

    // ===== STEP 5: Claude verification (secondary check) =====
    console.log(`Claude check prerequisites: ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY ? "set" : "MISSING"}, marketContext=${marketContext ? `${marketContext.length} chars` : "empty"}, cardId=${cardId ? "set" : "null"}`);
    if (ANTHROPIC_API_KEY && marketContext && cardId) {
      const claudeResult = await verifyWithClaude(
        cardId,
        result.estimated_value_low,
        result.estimated_value_high,
        marketContext,
        ANTHROPIC_API_KEY
      );
      if (claudeResult) {
        const origLow = result.estimated_value_low;
        const origHigh = result.estimated_value_high;
        result.estimated_value_low = claudeResult.verified_low;
        result.estimated_value_high = claudeResult.verified_high;
        if (origLow !== claudeResult.verified_low || origHigh !== claudeResult.verified_high) {
          console.log(`Claude corrected price: $${origLow}-$${origHigh} → $${claudeResult.verified_low}-$${claudeResult.verified_high}`);
        }
        console.log("Claude verification note:", claudeResult.verification_note);
      } else {
        console.log("Claude verification returned null — keeping programmatic estimate");
      }
    }

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
