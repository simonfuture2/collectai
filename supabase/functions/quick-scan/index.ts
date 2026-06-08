import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { identifyWithGemini } from "../_shared/gemini.ts";
import { getMarketData, crossCheckIdentification } from "../_shared/marketData.ts";

const IDENTIFY_MODEL = "gemini-3.5-flash";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// DB-backed rate limiter: 3 scans per IP per hour
async function checkRateLimit(ip: string): Promise<{ allowed: boolean; remaining: number }> {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const ipHash = await sha256Hex(`${ip}:collectai-quick-scan`);
  const { data, error } = await supabase.rpc("consume_ip_rate_limit", {
    _bucket_key: "quick_scan",
    _ip_hash: ipHash,
    _max_requests: 3,
    _window_seconds: 3600,
  });
  if (error) {
    console.error("rate limit RPC error:", error);
    return { allowed: false, remaining: 0 };
  }
  const row = Array.isArray(data) ? data[0] : data;
  return { allowed: !!row?.allowed, remaining: row?.remaining ?? 0 };
}

// Retry helper with exponential backoff for 429/529 errors
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3
): Promise<Response> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const response = await fetch(url, options);
    if (response.status !== 429 && response.status !== 529) return response;
    const delay = Math.pow(2, attempt + 1) * 1000; // 2s, 4s, 8s
    console.warn(`API returned ${response.status}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
    await new Promise((r) => setTimeout(r, delay));
  }
  // Final attempt without retry
  return fetch(url, options);
}

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

  async function doSearch(query: string, limit: number, urlFilter?: string, tbs: string = "qdr:m") {
    try {
      const response = await fetch("https://api.firecrawl.dev/v1/search", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query, limit, tbs }),
      });
      if (!response.ok) return [];
      const data = await response.json();
      const results = data.data || [];
      return urlFilter ? results.filter((r: any) => r.url?.includes(urlFilter)) : results;
    } catch {
      return [];
    }
  }

  // Sold listings: prefer last 14 days for freshness; fall back to last month if sparse
  async function searchSold(query: string, limit: number) {
    const fresh = await doSearch(query, limit, "ebay.com", "qdr:w");
    if (fresh.length >= 2) return fresh;
    return doSearch(query, limit, "ebay.com", "qdr:m");
  }

  try {
    let [soldResults, activeResults, tcgResults] = await Promise.all([
      searchSold(`"${specific}" sold site:ebay.com`, 8),
      doSearch(`"${specific}" site:ebay.com`, 6, "ebay.com"),
      doSearch(`"${specific}" price site:tcgplayer.com`, 5, "tcgplayer.com"),
    ]);

    let totalSpecific = soldResults.length + activeResults.length + tcgResults.length;
    if (totalSpecific < 3 && broad !== specific) {
      console.log("Specific search yielded few results, trying broader search...");
      const [soldBroad, activeBroad, tcgBroad] = await Promise.all([
        searchSold(`${broad} sold site:ebay.com`, 8),
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

    if (totalSpecific < 3 && variant) {
      console.log("Still sparse, trying variant-focused search:", variant);
      const [soldVar, activeVar, tcgVar] = await Promise.all([
        searchSold(`${variant} sold site:ebay.com`, 8),
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

    const rl = await checkRateLimit(clientIp);
    if (!rl.allowed) {
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

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    const mimeMatch = imageBase64.match(/^data:(image\/\w+);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");

    // ===== STEP 1: Identification with Gemini (direct API) =====
    console.log(`Quick scan Step 1: Identifying card with ${IDENTIFY_MODEL}...`);
    const idStart = Date.now();
    let cardId: CardIdentification | null = null;
    try {
      const dataUrl = `data:${mimeType};base64,${cleanBase64}`;
      cardId = await identifyWithGemini(dataUrl, IDENTIFY_MODEL);
      console.log(
        `Quick scan Step 1 done in ${Date.now() - idStart}ms (model=${IDENTIFY_MODEL}):`,
        cardId ? JSON.stringify(cardId) : "null",
      );
    } catch (err) {
      console.error(`Step 1 (${IDENTIFY_MODEL}) failed:`, err);
    }

    // ===== STEP 2: Tiered cross-referenced market data =====
    let marketContext = "";
    if (cardId?.card_name) {
      const aggregated = await getMarketData(cardId, undefined, true);
      marketContext = aggregated.summary;
      console.log(
        `Quick scan market: sources=${aggregated.sources.map(s => s.source).join(",")} | crossRef agree=${aggregated.crossReference.agree ?? "n/a"}`,
      );
    }

    // ===== STEP 3: Use Claude for full analysis + pricing =====
    const today = new Date().toISOString().split("T")[0];
    const cardContext = cardId
      ? `\nIdentified card: ${cardId.card_name} ${cardId.card_number || ""} (${cardId.card_set || ""}, ${cardId.card_year || ""}, ${cardId.variant || ""}, ${cardId.rarity || ""})`
      : "";

    const claudePrompt = `You are a trading card expert. Today is ${today}.
${cardContext}
${marketContext ? `\n${marketContext}` : "\nNo real-time market data available. Use your knowledge to estimate a fair value range."}

Analyze this trading card image. Return a JSON object with these exact fields:
- card_name: string (full name)
- card_set: string (set/series)
- card_year: string
- condition_grade: string (e.g. "NM 7", "MT 9")
- estimated_value_low: number (USD)
- estimated_value_high: number (USD)
- confidence: number (0-100)
- category: string (e.g. "Pokémon", "Sports Card")

${marketContext ? `CRITICAL: The SUGGESTED VALUE in the market data is the most reliable price. Use it:
- estimated_value_low = SUGGESTED VALUE × 0.85 (rounded)
- estimated_value_high = SUGGESTED VALUE × 1.15 (rounded)
- If market data shows prices in the $50-200 range, your estimate MUST be in that range, NOT $5-25.` : "Be conservative but reasonable. Use your training knowledge of card values."}

Return ONLY the JSON object, no other text.`;

    console.log("Quick scan Step 3: Sending to Claude for analysis...");
    const claudeResponse = await fetchWithRetry("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mimeType,
                  data: cleanBase64,
                },
              },
              { type: "text", text: claudePrompt },
            ],
          },
        ],
      }),
    });

    if (!claudeResponse.ok) {
      const status = claudeResponse.status;
      const errText = await claudeResponse.text();
      console.error("Claude API error:", status, errText);
      return new Response(
        JSON.stringify({ error: "Failed to analyze card. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const claudeData = await claudeResponse.json();
    const responseText = claudeData.content?.[0]?.text || "";
    console.log("Claude raw response:", responseText.substring(0, 500));

    // Extract JSON from Claude's response
    let result: any;
    try {
      result = JSON.parse(responseText);
    } catch {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          result = JSON.parse(jsonMatch[0]);
        } catch {
          console.error("Failed to parse JSON from Claude response");
          return new Response(
            JSON.stringify({ error: "Could not identify this card. Try a clearer photo." }),
            { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } else {
        console.error("No JSON found in Claude response:", responseText);
        return new Response(
          JSON.stringify({ error: "Could not identify this card. Try a clearer photo." }),
          { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Ensure all required fields exist with defaults
    result.card_name = result.card_name || cardId?.card_name || "Unknown Card";
    result.card_set = result.card_set || cardId?.card_set || "Unknown Set";
    result.card_year = result.card_year || cardId?.card_year || "";
    result.condition_grade = result.condition_grade || "NM 7";
    result.estimated_value_low = result.estimated_value_low ?? 0;
    result.estimated_value_high = result.estimated_value_high ?? 0;
    result.confidence = result.confidence ?? 50;
    result.category = result.category || "Pokémon";

    console.log(`Claude estimate: $${result.estimated_value_low}-$${result.estimated_value_high}, confidence: ${result.confidence}`);

    // ===== STEP 4: PROGRAMMATIC PRICE OVERRIDE from market data =====
    const blendedValue = extractBlendedValue(marketContext);
    if (blendedValue > 0) {
      const progLow = Math.round(blendedValue * 0.85);
      const progHigh = Math.round(blendedValue * 1.15);
      const claudeMid = (result.estimated_value_low + result.estimated_value_high) / 2;
      if (claudeMid < blendedValue * 0.5 || claudeMid > blendedValue * 2) {
        console.log(`Programmatic override: Claude mid=$${claudeMid.toFixed(2)} vs blended=$${blendedValue.toFixed(2)} — overriding`);
        result.estimated_value_low = progLow;
        result.estimated_value_high = progHigh;
        result.confidence = Math.min(95, Math.max(result.confidence, 75));
      } else {
        console.log(`Claude estimate aligns with market data (mid=$${claudeMid.toFixed(2)}, blended=$${blendedValue.toFixed(2)}) — keeping Claude's values`);
      }
    }

    console.log(`Final result: $${result.estimated_value_low}-$${result.estimated_value_high}`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("quick-scan error:", e);
    return new Response(
      JSON.stringify({ error: "An internal error occurred. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
