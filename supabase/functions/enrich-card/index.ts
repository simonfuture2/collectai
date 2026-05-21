// Background enrichment: market search + price analysis + (optional) cross-verify.
// Invoked server-to-server from identify-card (or from CardDetail "Retry analysis").
// Updates the cards row in place and inserts price_history.
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function extractPrices(text: string): number[] {
  const cleaned = text.replace(/\$[\d,]+\.?\d*\s*(shipping|ship|s\/h|postage|delivery)/gi, "");
  const matches = cleaned.match(/\$[\d,]+\.?\d*/g) || [];
  return matches.map((m) => parseFloat(m.replace(/[$,]/g, ""))).filter((n) => n > 0.99 && n < 100000);
}
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
function safeFixed(val: unknown, digits = 2): string {
  const num = typeof val === "number" ? val : Number(val);
  return isNaN(num) ? "0" : num.toFixed(digits);
}

// Hard timeout wrapper to prevent any single API call from hanging the job.
async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return await Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

async function callGeminiVision(
  model: string,
  systemPrompt: string,
  userText: string,
  images: { label: string; url: string }[],
  LOVABLE_API_KEY: string,
  timeoutMs: number,
  maxTokens: number,
): Promise<string | null> {
  try {
    const response = await withTimeout(
      fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: [
                { type: "text", text: userText },
                ...images.map((img) => ({
                  type: "image_url" as const,
                  image_url: { url: img.url },
                })),
              ],
            },
          ],
        }),
      }),
      timeoutMs,
      `gemini-${model}`,
    );
    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.error(`[enrich-card] gemini ${model} failed:`, response.status, errText.slice(0, 200));
      return null;
    }
    const data = await response.json();
    return data.choices?.[0]?.message?.content || null;
  } catch (err) {
    console.error(`[enrich-card] gemini ${model} error:`, err);
    return null;
  }
}

type IdentifyResult = CardIdentification & {
  category?: string;
  preGradingAnalysis?: any;
  defects?: any[];
  conditionGrade?: string;
  conditionNotes?: string;
  specialFeatures?: string[];
};

async function identifyCardFromImages(
  images: { label: string; url: string }[],
  LOVABLE_API_KEY: string,
): Promise<IdentifyResult | null> {
  const systemPrompt = `You are an expert trading card identifier AND professional grader. Look at the card image(s) carefully.

TASK 1 - IDENTIFICATION: Read ALL text on the card. Capture name, number, set, year, variant, rarity, and category.

TASK 2 - CONDITION GRADING: Assess physical condition from the image(s). Score centering, corners, edges, and surface on a 1-10 scale. Predict graded outcomes (PSA, BGS, CGC, SGC). Mark visible defects with normalized [0..1] coordinates (x=left, y=top) and severity (minor/moderate/severe).

Respond with ONLY a single valid JSON object (no markdown, no commentary):
{
  "card_name": "string",
  "card_number": "string (e.g. '105/086'), empty if not visible",
  "card_set": "string",
  "card_year": "string",
  "variant": "string",
  "rarity": "string",
  "category": "Trading Card | Sports Card | Coin | Comic",
  "preGradingAnalysis": {
    "centering": { "score": number, "frontLeftRight": "string", "frontTopBottom": "string", "backLeftRight": "string", "backTopBottom": "string", "notes": "string", "psa10Eligible": boolean },
    "corners": { "score": number, "topLeft": "string", "topRight": "string", "bottomLeft": "string", "bottomRight": "string", "notes": "string" },
    "edges": { "score": number, "top": "string", "bottom": "string", "left": "string", "right": "string", "notes": "string" },
    "surface": { "score": number, "front": "string", "back": "string", "holoCondition": "string or null", "notes": "string" },
    "overallScore": number,
    "predictedGrades": { "psa": number, "bgs": number, "cgc": number, "sgc": number },
    "bgsSubgrades": { "centering": number, "corners": number, "edges": number, "surface": number }
  },
  "defects": [{ "type": "string", "side": "front" | "back", "x": number, "y": number, "severity": "minor" | "moderate" | "severe", "note": "string" }],
  "conditionGrade": "string (e.g. 'Near Mint', 'Mint', 'Excellent')",
  "conditionNotes": "string",
  "specialFeatures": ["string"]
}`;
  const userText = "Identify this collectible AND grade its condition. Be precise and return the full JSON object.";
  const imgs = images.slice(0, 2);

  // Primary: Gemini 3.5 Flash (vision). Fast fallback: Gemini 3 Flash.
  let text = await callGeminiVision("google/gemini-3.5-flash", systemPrompt, userText, imgs, LOVABLE_API_KEY, 20_000, 2048);
  if (!text) {
    console.log("[enrich-card] identify falling back to gemini-3-flash");
    text = await callGeminiVision("google/gemini-3-flash", systemPrompt, userText, imgs, LOVABLE_API_KEY, 10_000, 2048);
  }
  if (!text) return null;
  try {
    let jsonStr = text.trim();
    const fenced = jsonStr.match(/```json\n?([\s\S]*?)\n?```/) || jsonStr.match(/```\n?([\s\S]*?)\n?```/);
    if (fenced) jsonStr = fenced[1];
    const first = jsonStr.indexOf("{");
    const last = jsonStr.lastIndexOf("}");
    if (first !== -1 && last !== -1) jsonStr = jsonStr.slice(first, last + 1);
    const parsed = JSON.parse(jsonStr) as IdentifyResult;
    if (!parsed?.card_name) return null;
    return parsed;
  } catch (err) {
    console.error("[enrich-card] identify parse error:", err);
    return null;
  }
}

// Text-only Gemini pricing call. Takes Gemini identification + condition + market summary;
// returns pricing/market/recommendation fields only.
async function analyzePricingWithGemini(
  identification: IdentifyResult,
  marketSummary: string,
  hasMarketData: boolean,
  LOVABLE_API_KEY: string,
): Promise<any | null> {
  const today = new Date().toISOString().split("T")[0];
  const condition = identification.preGradingAnalysis || {};
  const conditionSummary = {
    conditionGrade: identification.conditionGrade || null,
    overallScore: condition.overallScore ?? null,
    predictedGrades: condition.predictedGrades ?? null,
  };

  const systemPrompt = `You are an expert trading card pricing analyst and market appraiser. Today is ${today}.

You will receive: (1) a trading card identification produced by a vision model, (2) a physical condition assessment, and (3) real recent market data when available. Your job is pricing/market reasoning ONLY. DO NOT re-identify the card and DO NOT re-grade condition.

${hasMarketData ? `VALUATION FORMULA:
1. eBay SOLD prices are the primary anchor (50% weight).
2. TCGPlayer prices are secondary (30% weight).
3. eBay ACTIVE listings supplement (20% weight).
4. Weighted blend, then adjust ±15% based on condition.
5. estimatedValueLow = adjusted × 0.85, estimatedValueHigh = adjusted × 1.15.
6. NEVER override real market data with training knowledge.` : `NO-MARKET-DATA RULES:
1. Assume common/base version if uncertain.
2. Sports cards without market data: conservative $1-$20 unless rookies/autos/numbered.
3. NEVER estimate above $100 without market data unless clearly rare insert/auto/numbered.
4. confidence = "low"; use WIDE range (±50%).`}

Respond with ONLY a single valid JSON object (no markdown):
{
  "estimatedValueLow": number,
  "estimatedValueHigh": number,
  "valueCurrency": "USD",
  "ebayRecentSales": { "description": "string", "averagePrice": number, "lowPrice": number, "highPrice": number, "recentSalesCount": "string", "notableSales": ["string"] },
  "tcgplayerPrice": { "marketPrice": number, "lowPrice": number, "midPrice": number, "highPrice": number, "description": "string" },
  "psaPopulation": { "description": "string", "estimatedPopulation": "string", "gradedPremium": "string", "recentGradedSales": ["string"] },
  "gradedValueEstimates": {
    "currentGradeEstimate": "string",
    "worthGrading": boolean,
    "worthGradingReason": "string",
    "recommendedGrader": "PSA" | "BGS" | "CGC" | "SGC",
    "recommendedGraderReason": "string",
    "psa": { "estimatedGrade": number, "valueAtGrade": number, "valueAtPSA10": number, "valueAtPSA9": number, "gradingCost": number, "turnaroundTime": "string" },
    "otherGraders": { "bgsEstimatedGrade": number, "cgcEstimatedGrade": number, "sgcEstimatedGrade": number }
  },
  "priceFactors": ["string"],
  "valueTrend": "rising" | "stable" | "falling" | "unknown",
  "trendReason": "string",
  "confidence": "high" | "medium" | "low",
  "confidenceReason": "string",
  "investmentOutlook": "string",
  "additionalNotes": "string",
  "dataSource": "string"
}`;

  const userText = `IDENTIFICATION (from vision model):
${JSON.stringify({
  card_name: identification.card_name,
  card_number: identification.card_number,
  card_set: identification.card_set,
  card_year: identification.card_year,
  variant: identification.variant,
  rarity: identification.rarity,
  category: identification.category,
  specialFeatures: identification.specialFeatures || [],
}, null, 2)}

CONDITION ASSESSMENT (from vision model):
${JSON.stringify(conditionSummary, null, 2)}

${marketSummary || "No market data available."}

Produce the pricing JSON now.`;

  try {
    const response = await withTimeout(
      fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-pro-preview",
          max_tokens: 4096,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userText },
          ],
          response_format: { type: "json_object" },
        }),
      }),
      25_000,
      "gemini-pricing",
    );
    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.error("[enrich-card] gemini pricing failed:", response.status, errText.slice(0, 200));
      return null;
    }
    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content || "";
    if (!raw) return null;
    let jsonStr = raw.trim();
    const fenced = jsonStr.match(/```json\n?([\s\S]*?)\n?```/) || jsonStr.match(/```\n?([\s\S]*?)\n?```/);
    if (fenced) jsonStr = fenced[1];
    const first = jsonStr.indexOf("{");
    const last = jsonStr.lastIndexOf("}");
    if (first !== -1 && last !== -1) jsonStr = jsonStr.slice(first, last + 1);
    return JSON.parse(jsonStr);
  } catch (err) {
    console.error("[enrich-card] gemini pricing error:", err);
    return null;
  }
}

interface CardIdentification {
  card_name: string;
  card_number: string;
  card_set: string;
  card_year: string;
  variant: string;
  rarity: string;
}
interface MarketSourceData { source: string; median: number; low: number; high: number; count: number; prices: number[]; }
interface ExtractedMarketData { sources: MarketSourceData[]; blended: { median: number; low: number; high: number } | null; }

function buildSearchTerms(cardId: CardIdentification, category?: string) {
  const isSportsCard = /sport|baseball|basketball|football|hockey|soccer/i.test(category || "");
  let specific: string, broad: string, fallback: string;
  if (isSportsCard) {
    specific = `${cardId.card_name} ${cardId.card_year || ""} ${cardId.card_set || ""}`.trim();
    broad = `${cardId.card_name} ${cardId.card_year || ""} card`.trim();
    fallback = `${cardId.card_name} card`.trim();
  } else {
    const parts: string[] = [];
    if (cardId.card_name) parts.push(cardId.card_name);
    if (cardId.card_number) parts.push(cardId.card_number);
    if (cardId.variant && cardId.variant !== "Regular" && cardId.variant !== "Standard") parts.push(cardId.variant);
    specific = parts.join(" ");
    broad = `${cardId.card_name} ${cardId.card_set || ""} ${cardId.variant || ""}`.trim();
    fallback = `${cardId.card_name} ${cardId.card_set || ""} card`.trim();
  }
  return { specific, broad, fallback };
}

async function searchMarketPrices(cardId: CardIdentification, category: string | undefined, fastScan: boolean) {
  const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
  const emptyMarket: ExtractedMarketData = { sources: [], blended: null };
  const empty = { summary: "", hasData: false, extractedMarketData: emptyMarket };
  if (!FIRECRAWL_API_KEY) return empty;

  const isSportsCard = /sport|baseball|basketball|football|hockey|soccer/i.test(category || "");
  const { specific, broad, fallback } = buildSearchTerms(cardId, category);

  async function doSearch(query: string, limit: number, urlFilter?: string, tbs: string = "qdr:m") {
    try {
      const response = await withTimeout(
        fetch("https://api.firecrawl.dev/v1/search", {
          method: "POST",
          headers: { Authorization: `Bearer ${FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ query, limit, tbs }),
        }),
        15_000,
        "firecrawl-search",
      );
      if (!response.ok) return [];
      const data = await response.json();
      const results = data.data || [];
      return urlFilter ? results.filter((r: any) => r.url?.includes(urlFilter)) : results;
    } catch { return []; }
  }
  async function searchSold(query: string, limit: number) {
    const fresh = await doSearch(query, limit, "ebay.com", "qdr:w");
    if (fresh.length >= 2) return fresh;
    return doSearch(query, limit, "ebay.com", "qdr:m");
  }

  async function scrapeListing(url: string): Promise<string> {
    try {
      const response = await withTimeout(
        fetch("https://api.firecrawl.dev/v1/scrape", {
          method: "POST",
          headers: { Authorization: `Bearer ${FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ url, formats: ["markdown"] }),
        }),
        15_000,
        "firecrawl-scrape",
      );
      if (!response.ok) return "";
      const data = await response.json();
      return (data.data?.markdown || "").substring(0, 2000);
    } catch { return ""; }
  }

  try {
    let [soldResults, activeResults, tcgResults] = await Promise.all([
      searchSold(`"${specific}" sold site:ebay.com`, 6),
      doSearch(`"${specific}" site:ebay.com`, 4, "ebay.com"),
      isSportsCard ? Promise.resolve([]) : doSearch(`"${specific}" price site:tcgplayer.com`, 3, "tcgplayer.com"),
    ]);
    const totalSpecific = soldResults.length + activeResults.length + tcgResults.length;
    if (!fastScan && totalSpecific < 3 && specific !== broad) {
      const [soldBroad, activeBroad, tcgBroad] = await Promise.all([
        searchSold(`${broad} sold site:ebay.com`, 6),
        doSearch(`${broad} site:ebay.com`, 4, "ebay.com"),
        isSportsCard ? Promise.resolve([]) : doSearch(`${broad} price site:tcgplayer.com`, 3, "tcgplayer.com"),
      ]);
      if (soldBroad.length + activeBroad.length + tcgBroad.length > totalSpecific) {
        soldResults = soldBroad; activeResults = activeBroad; tcgResults = tcgBroad;
      }
    }

    let soldPrices: number[] = [];
    const soldListings = soldResults.slice(0, 8).map((r: any) => {
      const text = `${r.title || ""} ${r.description || ""} ${(r.markdown || "").substring(0, 800)}`;
      const prices = extractPrices(text);
      soldPrices.push(...prices);
      return `- ${r.title || "Listing"} | Prices: ${prices.length > 0 ? prices.map((p) => `$${p.toFixed(2)}`).join(", ") : "none detected"}`;
    });
    soldPrices = filterOutliers(soldPrices);

    let activePrices: number[] = [];
    const activeListings = activeResults.slice(0, 6).map((r: any) => {
      const text = `${r.title || ""} ${r.description || ""} ${(r.markdown || "").substring(0, 800)}`;
      const prices = extractPrices(text);
      activePrices.push(...prices);
      return `- ${r.title || "Listing"} | Prices: ${prices.length > 0 ? prices.map((p) => `$${p.toFixed(2)}`).join(", ") : "none detected"}`;
    });
    activePrices = filterOutliers(activePrices);

    let tcgPrices: number[] = [];
    const tcgListings = tcgResults.slice(0, 5).map((r: any) => {
      const text = `${r.title || ""} ${r.description || ""} ${(r.markdown || "").substring(0, 800)}`;
      const prices = extractPrices(text);
      tcgPrices.push(...prices);
      return `- ${r.title || "Listing"} | Prices: ${prices.length > 0 ? prices.map((p) => `$${p.toFixed(2)}`).join(", ") : "none detected"}`;
    });
    tcgPrices = filterOutliers(tcgPrices);

    // Safety net: if titles/descriptions yielded too few prices, do a small scrape pass.
    const totalPrices = soldPrices.length + activePrices.length + tcgPrices.length;
    if (totalPrices < 3) {
      const topUrls: string[] = [
        ...soldResults.slice(0, 2).map((r: any) => r.url).filter(Boolean),
        ...activeResults.slice(0, 1).map((r: any) => r.url).filter(Boolean),
      ].slice(0, 3);
      if (topUrls.length > 0) {
        const scraped = await Promise.all(topUrls.map((u) => scrapeListing(u)));
        for (const md of scraped) {
          const extra = extractPrices(md);
          soldPrices.push(...extra);
        }
        soldPrices = filterOutliers(soldPrices);
      }
    }

    if (soldPrices.length === 0 && activePrices.length === 0 && tcgPrices.length === 0) return empty;

    const medianSold = median(soldPrices);
    const medianActive = median(activePrices);
    const medianTcg = median(tcgPrices);

    const sources: MarketSourceData[] = [];
    if (soldPrices.length > 0) sources.push({ source: "ebay_sold", median: medianSold, low: Math.min(...soldPrices), high: Math.max(...soldPrices), count: soldPrices.length, prices: soldPrices });
    if (activePrices.length > 0) sources.push({ source: "ebay_active", median: medianActive, low: Math.min(...activePrices), high: Math.max(...activePrices), count: activePrices.length, prices: activePrices });
    if (tcgPrices.length > 0) sources.push({ source: "tcgplayer", median: medianTcg, low: Math.min(...tcgPrices), high: Math.max(...tcgPrices), count: tcgPrices.length, prices: tcgPrices });

    const allMedians: { value: number; weight: number }[] = [];
    if (soldPrices.length > 0) allMedians.push({ value: medianSold, weight: 0.5 });
    if (activePrices.length > 0) allMedians.push({ value: medianActive, weight: 0.2 });
    if (tcgPrices.length > 0) allMedians.push({ value: medianTcg, weight: 0.3 });

    let blended: ExtractedMarketData["blended"] = null;
    if (allMedians.length > 0) {
      const totalWeight = allMedians.reduce((s, m) => s + m.weight, 0);
      const blendedMedian = allMedians.reduce((s, m) => s + m.value * (m.weight / totalWeight), 0);
      const allPrices = [...soldPrices, ...activePrices, ...tcgPrices];
      blended = { median: blendedMedian, low: Math.min(...allPrices), high: Math.max(...allPrices) };
    }

    let summary = "\n\n## REAL MARKET PRICE DATA (retrieved today from multiple sources)\n";
    summary += `Card searched: ${specific}\n`;
    if (soldPrices.length > 0) {
      summary += `\n### eBay SOLD LISTINGS (last 30 days):\n- Filtered prices: ${soldPrices.map((p) => `$${p.toFixed(2)}`).join(", ")}\n- Median sold price: $${medianSold.toFixed(2)}\n- Range: $${Math.min(...soldPrices).toFixed(2)} - $${Math.max(...soldPrices).toFixed(2)}\n- Count: ${soldPrices.length} price points\n\nDetails:\n${soldListings.join("\n")}\n`;
    }
    if (activePrices.length > 0) {
      summary += `\n### eBay ACTIVE LISTINGS:\n- Filtered prices: ${activePrices.map((p) => `$${p.toFixed(2)}`).join(", ")}\n- Median asking price: $${medianActive.toFixed(2)}\n\nDetails:\n${activeListings.join("\n")}\n`;
    }
    if (tcgPrices.length > 0) {
      summary += `\n### TCGPlayer PRICES:\n- Filtered prices: ${tcgPrices.map((p) => `$${p.toFixed(2)}`).join(", ")}\n- Median TCGPlayer price: $${medianTcg.toFixed(2)}\n\nDetails:\n${tcgListings.join("\n")}\n`;
    }
    if (blended) summary += `\n### SUGGESTED BLENDED VALUE: $${blended.median.toFixed(2)}\n`;
    summary += `\nCRITICAL: Your estimatedValueLow and estimatedValueHigh MUST be within the range of these real prices.\n`;

    return { summary, hasData: true, extractedMarketData: { sources, blended } };
  } catch (err) {
    console.error("Market price search failed:", err);
    return empty;
  }
}

async function verifyWithGemini(cardId: CardIdentification, analysis: any, marketSummary: string, LOVABLE_API_KEY: string) {
  try {
    const prompt = `You are a trading card price verification expert.\n\nCard: ${cardId.card_name} ${cardId.card_number || ""} ${cardId.variant || ""}\nCondition: ${analysis.conditionGrade || "Unknown"}\nAI estimated: $${safeFixed(analysis.estimatedValueLow)} - $${safeFixed(analysis.estimatedValueHigh)}\n\n${marketSummary}\n\nReturn ONLY JSON: {"verified_low": number, "verified_high": number, "verification_note": "brief"}`;
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "google/gemini-2.5-flash-lite", messages: [{ role: "user", content: prompt }], response_format: { type: "json_object" } }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) return null;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const result = JSON.parse(jsonMatch[0]);
    if (typeof result.verified_low !== "number" || typeof result.verified_high !== "number") return null;
    return { verifiedLow: result.verified_low, verifiedHigh: result.verified_high, verificationNote: result.verification_note || "" };
  } catch { return null; }
}

async function runEnrichment(params: {
  cardId: string;
  userId: string;
  images: { label: string; url: string }[];
  identification: IdentifyResult;
  category?: string;
  fastScan: boolean;
  supabaseAdmin: ReturnType<typeof createClient>;
}) {
  const { cardId, userId, images, identification, category, fastScan, supabaseAdmin } = params;
  const LOVABLE_API_KEY_MAIN = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY_MAIN) throw new Error("LOVABLE_API_KEY not configured");

  console.log(`[enrich-card] start card=${cardId} fastScan=${fastScan}`);

  // Stage: pricing (market data fetch)
  await supabaseAdmin.from("cards").update({ analysis_status: "pricing" }).eq("id", cardId);
  const marketData = await searchMarketPrices(identification, category, fastScan);
  console.log(`[enrich-card] market data hasData=${marketData.hasData}`);

  // Stage: analyzing (text-only Gemini pricing call — NO images)
  await supabaseAdmin.from("cards").update({ analysis_status: "analyzing" }).eq("id", cardId);
  const pricing = await analyzePricingWithGemini(
    identification,
    marketData.summary,
    marketData.hasData,
    LOVABLE_API_KEY_MAIN,
  );
  if (!pricing) throw new Error("Pricing analysis failed");

  // Merge: identification + condition (Gemini vision) + pricing (Gemini Pro)
  const analysis: any = {
    // Identification (Gemini vision)
    category: identification.category || category || "Trading Card",
    cardName: identification.card_name || null,
    cardSet: identification.card_set || null,
    cardYear: identification.card_year || null,
    cardNumber: identification.card_number || null,
    rarity: identification.rarity || null,
    parallelVariant: identification.variant || null,
    edition: identification.variant || null,
    specialFeatures: identification.specialFeatures || [],
    // Condition (Gemini vision)
    conditionGrade: identification.conditionGrade || null,
    conditionNotes: identification.conditionNotes || null,
    preGradingAnalysis: identification.preGradingAnalysis || null,
    defects: identification.defects || [],
    // Pricing (Gemini Pro)
    ...pricing,
  };

  if (!analysis.dataSource) {
    analysis.dataSource = marketData.hasData
      ? "Real eBay + TCGPlayer data + Gemini Pro pricing + Gemini vision"
      : "Gemini Pro pricing estimate (no live market data) + Gemini vision";
  }

  // No-market-data guardrails
  if (!marketData.hasData) {
    analysis.confidence = "low";
    analysis.noMarketData = true;
    analysis.confidenceReason = (analysis.confidenceReason || "") + " No real-time market data — values are AI estimates only.";
    const highVal = Number(analysis.estimatedValueHigh) || 0;
    const lowVal = Number(analysis.estimatedValueLow) || 0;
    if (highVal > 100) {
      const hasHighValueTraits = /auto(graph)?|numbered|\/\d{1,3}$|1st edition|rookie|rc|parallel|refractor|prismatic/i.test(
        `${analysis.rarity || ""} ${analysis.parallelVariant || ""} ${analysis.specialFeatures?.join(" ") || ""} ${analysis.edition || ""}`
      );
      if (!hasHighValueTraits) {
        analysis.estimatedValueHigh = Math.min(highVal, 100);
        analysis.estimatedValueLow = Math.min(lowVal, analysis.estimatedValueHigh * 0.5);
        analysis.valuationWarning = "High value estimated without market verification — capped.";
      } else {
        analysis.estimatedValueLow = Math.round(lowVal * 0.5);
        analysis.estimatedValueHigh = Math.round(highVal * 1.5);
        analysis.valuationWarning = "High value estimated without market verification — rough estimate.";
      }
    } else {
      analysis.estimatedValueLow = Math.round(lowVal * 0.5);
      analysis.estimatedValueHigh = Math.round(highVal * 1.5);
    }
  }

  // Stage: verifying — quick Gemini Flash Lite sanity check on >$100 cards with market data.
  const highForVerify = Number(analysis.estimatedValueHigh) || 0;
  if (!fastScan && marketData.hasData && highForVerify >= 100) {
    await supabaseAdmin.from("cards").update({ analysis_status: "verifying" }).eq("id", cardId);
    const verification = await withTimeout(
      verifyWithGemini(identification, analysis, marketData.summary, LOVABLE_API_KEY_MAIN),
      8_000,
      "verify-gemini",
    ).catch(() => null);
    if (verification) {
      const primaryMid = ((Number(analysis.estimatedValueLow) || 0) + (Number(analysis.estimatedValueHigh) || 0)) / 2;
      const verifyMid = (verification.verifiedLow + verification.verifiedHigh) / 2;
      const agree = Math.abs(verifyMid - primaryMid) / Math.max(verifyMid, primaryMid, 1) < 0.25;
      // Blend: 60% primary Gemini pricing, 40% sanity check.
      analysis.estimatedValueLow = Math.round((Number(analysis.estimatedValueLow) * 0.6 + verification.verifiedLow * 0.4) * 100) / 100;
      analysis.estimatedValueHigh = Math.round((Number(analysis.estimatedValueHigh) * 0.6 + verification.verifiedHigh * 0.4) * 100) / 100;
      analysis.verificationNote = `Sanity check: $${safeFixed(verification.verifiedLow)}-$${safeFixed(verification.verifiedHigh)}. ${agree ? "Estimates agree." : "Estimates disagree."} ${verification.verificationNote || ""}`;
      analysis.crossVerified = true;
      analysis.modelsAgree = agree;
      if (agree && analysis.confidence !== "high") analysis.confidence = "high";
      analysis.dataSource = `Real market data + Gemini Pro pricing + Flash-Lite verified ${agree ? "✓✓" : "(disagreement)"}`;
    }
  }


  // Update card row
  const { error: updateError } = await supabaseAdmin
    .from("cards")
    .update({
      category: analysis.category || "Trading Card",
      card_name: identification.card_name || null,
      card_set: identification.card_set || null,
      card_year: identification.card_year || null,
      edition: identification.variant || null,
      rarity: identification.rarity || null,
      condition_grade: identification.conditionGrade || null,
      special_features: identification.specialFeatures || [],
      estimated_value_low: analysis.estimatedValueLow ?? null,
      estimated_value_high: analysis.estimatedValueHigh ?? null,
      ebay_recent_sales: analysis.ebayRecentSales || null,
      tcgplayer_price: analysis.tcgplayerPrice || null,
      psa_population_data: analysis.psaPopulation || null,
      ai_analysis: { ...analysis, extractedMarketData: marketData.extractedMarketData },
      last_scanned_at: new Date().toISOString(),
      analysis_status: "complete",
      analysis_error: null,
      analysis_completed_at: new Date().toISOString(),
    })
    .eq("id", cardId);

  if (updateError) throw updateError;

  // Price history
  if (marketData.extractedMarketData) {
    const priceRows: any[] = [];
    const emd = marketData.extractedMarketData;
    for (const src of emd.sources) {
      priceRows.push({
        card_id: cardId, user_id: userId, source: src.source,
        median_price: src.median, low_price: src.low, high_price: src.high,
        price_count: src.count, raw_prices: src.prices,
      });
    }
    if (emd.blended) {
      priceRows.push({
        card_id: cardId, user_id: userId, source: "blended",
        median_price: emd.blended.median, low_price: emd.blended.low, high_price: emd.blended.high,
        price_count: 0, raw_prices: [],
      });
    }
    if (priceRows.length > 0) {
      await supabaseAdmin.from("price_history").insert(priceRows);
    }
  }

  console.log(`[enrich-card] complete card=${cardId}`);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Auth: only accept calls from our own backend using the service role key.
  const authHeader = req.headers.get("Authorization") || "";
  if (authHeader !== `Bearer ${serviceKey}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceKey);

  let body: any;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { cardId, images, category, fastScan } = body || {};
  let identification: IdentifyResult | undefined = body?.identification;

  if (!cardId || !Array.isArray(images) || images.length === 0) {
    return new Response(JSON.stringify({ error: "cardId and images required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Validate card ownership (must exist)
  const { data: card, error: cardErr } = await supabaseAdmin
    .from("cards")
    .select("id, user_id")
    .eq("id", cardId)
    .single();
  if (cardErr || !card) {
    return new Response(JSON.stringify({ error: "Card not found" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const work = (async () => {
    try {
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

      // Stage 1: identify (if not supplied)
      let resolvedCategory = category;
      if (!identification?.card_name) {
        await supabaseAdmin.from("cards").update({
          analysis_status: "identifying",
          analysis_started_at: new Date().toISOString(),
          analysis_error: null,
        }).eq("id", cardId);

        const idResult = await identifyCardFromImages(images, LOVABLE_API_KEY);
        if (!idResult?.card_name) {
          throw new Error("Could not identify the card. Please try a clearer image.");
        }
        identification = idResult;
        if (idResult.category) resolvedCategory = idResult.category;

        // Persist identification immediately so detail page can show name.
        await supabaseAdmin.from("cards").update({
          card_name: idResult.card_name,
          card_set: idResult.card_set || null,
          card_year: idResult.card_year || null,
          rarity: idResult.rarity || null,
          category: resolvedCategory || "Trading Card",
          analysis_status: "pricing",
        }).eq("id", cardId);
      } else {
        await supabaseAdmin.from("cards").update({
          analysis_status: "pricing",
          analysis_started_at: new Date().toISOString(),
          analysis_error: null,
        }).eq("id", cardId);
      }

      // Stage 2: pricing + full analysis
      await runEnrichment({
        cardId,
        userId: card.user_id as string,
        images,
        identification: identification!,
        category: resolvedCategory,
        fastScan: fastScan === true,
        supabaseAdmin,
      });
    } catch (err: any) {
      console.error("[enrich-card] failed:", err);
      await supabaseAdmin.from("cards").update({
        analysis_status: "failed",
        analysis_error: String(err?.message || err).slice(0, 500),
        analysis_completed_at: new Date().toISOString(),
      }).eq("id", cardId);
    }
  })();

  // @ts-ignore - EdgeRuntime is available in Deno Deploy
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
    // @ts-ignore
    EdgeRuntime.waitUntil(work);
  } else {
    work.catch(() => {});
  }

  return new Response(JSON.stringify({ status: "started", cardId }), {
    status: 202,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

