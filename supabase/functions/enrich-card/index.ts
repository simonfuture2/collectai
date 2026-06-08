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
  jsonMode = false,
): Promise<string | null> {
  try {
    const body: any = {
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
    };
    if (jsonMode) body.response_format = { type: "json_object" };
    const response = await withTimeout(
      fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
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

// Resilient JSON extractor: strips markdown fences, control chars,
// trims to outermost {...}, removes trailing commas.
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

TASK 1 - IDENTIFICATION: Read text on the card. Capture name, number, set, year, variant, rarity, and category.

TASK 2 - CONDITION GRADING: Assess physical condition. Score centering, corners, edges, surface on 1-10. Predict graded outcomes (PSA, BGS, CGC, SGC). Mark visible defects with normalized [0..1] coordinates and severity.

CRITICAL OUTPUT RULES:
- Respond with ONE valid JSON object only. No markdown, no commentary.
- Keep every "notes" field UNDER 80 characters. Be terse.
- Keep "conditionNotes" under 150 characters.
- Do not invent fields. Use empty string "" or null when unknown.

Schema:
{
  "card_name": "string",
  "card_number": "string",
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
  "conditionGrade": "string",
  "conditionNotes": "string",
  "specialFeatures": ["string"]
}`;
  const userText = "Identify this collectible AND grade its condition. Return the full JSON object — keep notes very short.";
  const imgs = images.slice(0, 2);

  // Primary: Gemini 3.5 Flash with JSON mode + ample tokens. Fallback: Gemini 3 Flash.
  let text = await callGeminiVision("google/gemini-3.5-flash", systemPrompt, userText, imgs, LOVABLE_API_KEY, 25_000, 4096, true);
  if (!text) {
    console.log("[enrich-card] identify falling back to gemini-3-flash");
    text = await callGeminiVision("google/gemini-3-flash", systemPrompt, userText, imgs, LOVABLE_API_KEY, 15_000, 4096, true);
  }
  if (!text) return null;
  try {
    const parsed = extractJsonObject(text) as IdentifyResult;
    if (!parsed?.card_name) {
      console.error("[enrich-card] identify missing card_name. Raw:", text.slice(0, 500));
      return null;
    }
    return parsed;
  } catch (err) {
    console.error("[enrich-card] identify parse error:", err, "Raw:", text.slice(0, 800));
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
    "recommendedGrader": "PSA" | "BGS" | "CGC" | "SGC" | "TAG",
    "recommendedGraderReason": "string",
    "psa": { "estimatedGrade": number, "valueAtGrade": number, "valueAtPSA10": number, "valueAtPSA9": number, "valueAtPSA8": number, "gradingCost": number, "turnaroundTime": "string" },
    "bgs": { "estimatedGrade": number, "valueAtGrade": number, "valueAtBGS10": number, "valueAtBGS9_5": number, "valueAtBGS9": number, "gradingCost": number, "turnaroundTime": "string", "blackLabelPotential": "string" },
    "cgc": { "estimatedGrade": number, "valueAtGrade": number, "valueAtCGC10": number, "valueAtCGC9_5": number, "valueAtCGC9": number, "gradingCost": number, "turnaroundTime": "string" },
    "sgc": { "estimatedGrade": number, "valueAtGrade": number, "valueAtSGC10": number, "valueAtSGC9_5": number, "valueAtSGC9": number, "gradingCost": number, "turnaroundTime": "string" },
    "tag": { "estimatedGrade": number, "valueAtGrade": number, "valueAtTAG10": number, "valueAtTAG9_5": number, "valueAtTAG9": number, "gradingCost": number, "turnaroundTime": "string" }
  },

GRADED-LADDER RULES (MANDATORY — read carefully, this is the most-checked output):
- Per-tier grounding: for every grader/grade tier (PSA 10, PSA 9, PSA 8, BGS 10, BGS 9.5, BGS 9, CGC 10, CGC 9.5, SGC 10, SGC 9.5, TAG 10, TAG 9.5) you MUST use the median from the "REAL PER-GRADE SOLD COMPS" block when it lists comps for that tier. Round to the nearest dollar. Quote 1–2 of those comps in priceFactors.
- NO-COMPS RULE: when the per-grade block says "NO SOLD COMPS FOUND" for a tier, you MUST set that value field to null. DO NOT extrapolate from the PSA anchor, from raw value, or from inter-grader premiums. Inventing a number here is the single worst failure mode of this system.
- Set valueAtGrade for each grader to the median of comps at the grader's estimatedGrade tier. If there are no comps at that tier, set valueAtGrade to null and lower confidence to "low".
- Sanity check: valueAtPSA10 ≥ valueAtPSA9 ≥ valueAtPSA8 (same ladder for BGS/CGC/SGC/TAG). If your numbers violate this, your tier values are wrong — re-check the comp data.
- Category coverage: TCG → populate psa, cgc, bgs, tag (set sgc to null). Sports → populate psa, cgc, bgs, sgc (set tag to null). Other → psa, cgc, bgs (others null). A grader block with all null value fields is still acceptable — honest > invented.
- Confidence: if any tier you returned has fewer than 2 real comps backing it, set top-level confidence to "low" and write a confidenceReason that names the missing tiers.

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
    try {
      return extractJsonObject(raw);
    } catch (err) {
      console.error("[enrich-card] pricing parse error:", err, "Raw:", raw.slice(0, 500));
      return null;
    }
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
type RecencyWindow = "7d" | "30d" | "12m" | "36m";
interface MarketSourceData { source: string; median: number; low: number; high: number; count: number; prices: number[]; recencyWindow?: RecencyWindow; }
interface GradedTierComps { median: number; low: number; high: number; count: number; prices: number[]; recencyWindow?: RecencyWindow }
type GraderKey = "psa" | "bgs" | "cgc" | "sgc" | "tag";
type GradedComps = Partial<Record<GraderKey, Record<string, GradedTierComps | null>>>;
interface ExtractedMarketData {
  sources: MarketSourceData[];
  blended: { median: number; low: number; high: number } | null;
  gradedComps?: GradedComps;
  rawConfidence?: "high" | "medium" | "low";
  rawConfidenceReason?: string;
  ebaySoldRecencyWindow?: RecencyWindow;
}

function tbsForWindow(w: RecencyWindow): string {
  if (w === "7d") return "qdr:w";
  if (w === "30d") return "qdr:m";
  if (w === "12m") return "qdr:y";
  // ~3 years: Google custom date range from today-3y to today
  const now = new Date();
  const past = new Date(now.getFullYear() - 3, now.getMonth(), now.getDate());
  const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
  return `cdr:1,cd_min:${fmt(past)},cd_max:${fmt(now)}`;
}

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
  // Escalating recency ladder so vintage / low-volume cards still find real sold comps.
  // Returns the first window that meets the threshold, tagged with the window used.
  async function searchSoldLadder(query: string, limit: number): Promise<{ results: any[]; window: RecencyWindow }> {
    const ladder: { w: RecencyWindow; need: number }[] = [
      { w: "7d", need: 3 },
      { w: "30d", need: 3 },
      { w: "12m", need: 2 },
      { w: "36m", need: 1 },
    ];
    let lastResults: any[] = [];
    let lastWindow: RecencyWindow = "36m";
    for (const step of ladder) {
      const r = await doSearch(query, limit, "ebay.com", tbsForWindow(step.w));
      lastResults = r;
      lastWindow = step.w;
      if (r.length >= step.need) return { results: r, window: step.w };
    }
    return { results: lastResults, window: lastWindow };
  }
  async function searchSold(query: string, limit: number) {
    return (await searchSoldLadder(query, limit)).results;
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
    let soldLadder = await searchSoldLadder(`"${specific}" sold site:ebay.com`, 6);
    let soldResults = soldLadder.results;
    let ebaySoldRecencyWindow: RecencyWindow = soldLadder.window;
    let [activeResults, tcgResults] = await Promise.all([
      doSearch(`"${specific}" site:ebay.com`, 4, "ebay.com"),
      isSportsCard ? Promise.resolve([]) : doSearch(`"${specific}" price site:tcgplayer.com`, 3, "tcgplayer.com"),
    ]);
    const totalSpecific = soldResults.length + activeResults.length + tcgResults.length;
    if (!fastScan && totalSpecific < 3 && specific !== broad) {
      const soldBroadLadder = await searchSoldLadder(`${broad} sold site:ebay.com`, 6);
      const [activeBroad, tcgBroad] = await Promise.all([
        doSearch(`${broad} site:ebay.com`, 4, "ebay.com"),
        isSportsCard ? Promise.resolve([]) : doSearch(`${broad} price site:tcgplayer.com`, 3, "tcgplayer.com"),
      ]);
      if (soldBroadLadder.results.length + activeBroad.length + tcgBroad.length > totalSpecific) {
        soldResults = soldBroadLadder.results;
        ebaySoldRecencyWindow = soldBroadLadder.window;
        activeResults = activeBroad; tcgResults = tcgBroad;
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

    // ---- Per-grade graded-comp retrieval (parallel) ----
    // Pulls real sold comps for each grader/grade tier relevant to the card category.
    // A tier with insufficient comps stays null — NEVER filled by multiplier.
    const tiersForCategory: { grader: GraderKey; grade: string; query: string }[] = [
      { grader: "psa", grade: "10", query: `"${specific}" "PSA 10" sold site:ebay.com` },
      { grader: "psa", grade: "9",  query: `"${specific}" "PSA 9" sold site:ebay.com` },
      { grader: "psa", grade: "8",  query: `"${specific}" "PSA 8" sold site:ebay.com` },
      { grader: "bgs", grade: "10", query: `"${specific}" "BGS 10" sold site:ebay.com` },
      { grader: "bgs", grade: "9.5", query: `"${specific}" "BGS 9.5" sold site:ebay.com` },
      { grader: "bgs", grade: "9",  query: `"${specific}" "BGS 9" sold site:ebay.com` },
      { grader: "cgc", grade: "10", query: `"${specific}" "CGC 10" sold site:ebay.com` },
      { grader: "cgc", grade: "9.5", query: `"${specific}" "CGC 9.5" sold site:ebay.com` },
    ];
    if (isSportsCard) {
      tiersForCategory.push(
        { grader: "sgc", grade: "10", query: `"${specific}" "SGC 10" sold site:ebay.com` },
        { grader: "sgc", grade: "9.5", query: `"${specific}" "SGC 9.5" sold site:ebay.com` },
      );
    } else {
      tiersForCategory.push(
        { grader: "tag", grade: "10", query: `"${specific}" "TAG 10" sold site:ebay.com` },
        { grader: "tag", grade: "9.5", query: `"${specific}" "TAG 9.5" sold site:ebay.com` },
      );
    }

    // Skip per-grade retrieval entirely on fast scans (would blow the time budget).
    const gradedComps: GradedComps = {};
    if (!fastScan) {
      const gradedResults = await Promise.all(
        tiersForCategory.map(async (t) => {
          const results = await doSearch(t.query, 4, "ebay.com", "qdr:m");
          let prices: number[] = [];
          for (const r of results.slice(0, 4)) {
            const text = `${r.title || ""} ${r.description || ""} ${(r.markdown || "").substring(0, 600)}`;
            // Only count prices from listings whose title also contains the grader+grade token.
            const tokenRe = new RegExp(`${t.grader}\\s*${t.grade.replace(".", "\\.")}\\b`, "i");
            if (!tokenRe.test(r.title || "") && !tokenRe.test(r.description || "")) continue;
            prices.push(...extractPrices(text));
          }
          prices = filterOutliers(prices);
          return { ...t, prices };
        }),
      );
      for (const r of gradedResults) {
        gradedComps[r.grader] = gradedComps[r.grader] || {};
        gradedComps[r.grader]![r.grade] = r.prices.length >= 2
          ? {
              median: median(r.prices),
              low: Math.min(...r.prices),
              high: Math.max(...r.prices),
              count: r.prices.length,
              prices: r.prices,
            }
          : null;
      }
    }
    // ---- end per-grade retrieval ----

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

    // ---- Build per-grade summary block for the LLM ----
    summary += `\n## REAL PER-GRADE SOLD COMPS (use these verbatim — DO NOT invent or extrapolate)\n`;
    const graderEntries = Object.entries(gradedComps) as [GraderKey, Record<string, GradedTierComps | null>][];
    if (graderEntries.length === 0) {
      summary += `(No per-grade comp retrieval was performed.)\n`;
    } else {
      for (const [grader, tiers] of graderEntries) {
        for (const [grade, comp] of Object.entries(tiers)) {
          if (comp) {
            summary += `- ${grader.toUpperCase()} ${grade}: median $${comp.median.toFixed(2)} (range $${comp.low.toFixed(2)}-$${comp.high.toFixed(2)}, ${comp.count} sold comps)\n`;
          } else {
            summary += `- ${grader.toUpperCase()} ${grade}: NO SOLD COMPS FOUND — value must be null and confidence low.\n`;
          }
        }
      }
    }

    // ---- Raw-anchor sanity flag (passed back as rawConfidence) ----
    let rawConfidence: "high" | "medium" | "low" = "high";
    let rawConfidenceReason: string | undefined;
    if (soldPrices.length < 3) {
      rawConfidence = "low";
      rawConfidenceReason = `Only ${soldPrices.length} raw sold comp(s) — anchor is unreliable.`;
    } else {
      const sortedDesc = [...soldPrices].sort((a, b) => b - a);
      if (sortedDesc[0] > 2 * (sortedDesc[1] ?? 0)) {
        rawConfidence = "low";
        rawConfidenceReason = `Top raw sale ($${sortedDesc[0].toFixed(0)}) is >2× the next ($${(sortedDesc[1] ?? 0).toFixed(0)}) — likely anomalous/mixed-set listing inflating the anchor.`;
      }
    }
    if (rawConfidence === "low") {
      summary += `\n⚠️ RAW-ANCHOR WARNING: ${rawConfidenceReason} Treat raw value as uncertain.\n`;
    }

    return {
      summary,
      hasData: true,
      extractedMarketData: { sources, blended, gradedComps, rawConfidence, rawConfidenceReason },
    };
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

  // ---- Per-tier grounding gate: scrub fabricated graded values ----
  // For any grader/tier the AI populated WITHOUT real comps backing it, null
  // it out. Better to show "Insufficient comps" than a hallucinated number.
  const gradedComps = marketData.extractedMarketData?.gradedComps;
  if (gradedComps && analysis.gradedValueEstimates) {
    const tierFieldMap: Record<GraderKey, Record<string, string>> = {
      psa: { "10": "valueAtPSA10", "9": "valueAtPSA9", "8": "valueAtPSA8" },
      bgs: { "10": "valueAtBGS10", "9.5": "valueAtBGS9_5", "9": "valueAtBGS9" },
      cgc: { "10": "valueAtCGC10", "9.5": "valueAtCGC9_5", "9": "valueAtCGC9" },
      sgc: { "10": "valueAtSGC10", "9.5": "valueAtSGC9_5", "9": "valueAtSGC9" },
      tag: { "10": "valueAtTAG10", "9.5": "valueAtTAG9_5", "9": "valueAtTAG9" },
    };
    const missing: string[] = [];
    for (const [grader, tiers] of Object.entries(gradedComps) as [GraderKey, Record<string, GradedTierComps | null>][]) {
      const block = analysis.gradedValueEstimates[grader];
      if (!block) continue;
      for (const [grade, fieldName] of Object.entries(tierFieldMap[grader] || {})) {
        const comp = tiers[grade];
        if (!comp && block[fieldName] != null) {
          missing.push(`${grader.toUpperCase()} ${grade}`);
          block[fieldName] = null;
        }
      }
      // If valueAtGrade has no underlying comps at the estimated grade tier, null it too.
      const estGrade = block.estimatedGrade != null ? String(block.estimatedGrade) : null;
      if (estGrade && !tiers[estGrade]) {
        if (block.valueAtGrade != null) block.valueAtGrade = null;
      }
    }
    if (missing.length > 0) {
      analysis.confidence = "low";
      analysis.confidenceReason =
        `No sold comps for: ${missing.join(", ")}. ` + (analysis.confidenceReason || "");
    }
  }

  // ---- Raw-anchor warning passthrough ----
  if (marketData.extractedMarketData?.rawConfidence === "low") {
    analysis.rawConfidence = "low";
    analysis.rawConfidenceReason = marketData.extractedMarketData.rawConfidenceReason;
    analysis.confidence = "low";
    analysis.confidenceReason =
      (marketData.extractedMarketData.rawConfidenceReason || "") + " " + (analysis.confidenceReason || "");
  } else {
    analysis.rawConfidence = marketData.extractedMarketData?.rawConfidence || "high";
  }

  // ---- Raw-vs-graded reconciliation ----
  // It's logically broken to show graded < raw at the predicted grade.
  // When this happens, the raw anchor is usually inflated by an anomalous sale.
  const rawHigh = Number(analysis.estimatedValueHigh) || 0;
  const psaBlock = analysis.gradedValueEstimates?.psa;
  const psaAtGrade = psaBlock?.valueAtGrade;
  if (rawHigh > 0 && typeof psaAtGrade === "number" && psaAtGrade < rawHigh) {
    analysis.rawConfidence = "low";
    analysis.rawConfidenceReason =
      (analysis.rawConfidenceReason || "") +
      ` Graded estimate ($${psaAtGrade}) is below raw high ($${rawHigh}) — raw anchor likely inflated by an anomalous listing.`;
    analysis.confidence = "low";
    analysis.confidenceReason =
      `Raw value uncertain — graded < raw at predicted grade. ` + (analysis.confidenceReason || "");
  }

  // ---- Honest dataSource label ----
  const realComps = (marketData.extractedMarketData?.sources || []).reduce((s, x) => s + x.count, 0);
  if (realComps < 3 && analysis.dataSource?.includes("Real eBay")) {
    analysis.dataSource = `Limited market data (${realComps} comp${realComps === 1 ? "" : "s"}) — values are best estimates`;
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

