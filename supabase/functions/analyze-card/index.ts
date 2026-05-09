import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

function safeFixed(val: unknown, digits = 2): string {
  const num = typeof val === 'number' ? val : Number(val);
  return isNaN(num) ? '0' : num.toFixed(digits);
}

interface CardIdentification {
  card_name: string;
  card_number: string;
  card_set: string;
  card_year: string;
  variant: string;
  rarity: string;
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

// Build specific search queries from card identification
function buildSearchTerms(cardId: CardIdentification, category?: string): { specific: string; broad: string; fallback: string } {
  const isSportsCard = /sport|baseball|basketball|football|hockey|soccer/i.test(category || "");

  let specific: string;
  let broad: string;
  let fallback: string;

  if (isSportsCard) {
    // Sports cards: player name + year + set works best on eBay
    specific = `${cardId.card_name} ${cardId.card_year || ""} ${cardId.card_set || ""}`.trim();
    broad = `${cardId.card_name} ${cardId.card_year || ""} card`.trim();
    fallback = `${cardId.card_name} card`.trim();
  } else {
    // TCG cards: name + number + variant
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

// Helper: search market listings via Firecrawl and return structured price data
async function searchMarketPrices(
  cardId: CardIdentification,
  category?: string
): Promise<{ summary: string; hasData: boolean; extractedMarketData: ExtractedMarketData }> {
  const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
  const emptyMarket: ExtractedMarketData = { sources: [], blended: null };
  const empty = { summary: "", hasData: false, extractedMarketData: emptyMarket };
  if (!FIRECRAWL_API_KEY) {
    console.log("FIRECRAWL_API_KEY not available, skipping market search");
    return empty;
  }

  const isSportsCard = /sport|baseball|basketball|football|hockey|soccer/i.test(category || "");
  const { specific, broad, fallback } = buildSearchTerms(cardId, category);

  async function doSearch(query: string, limit: number, urlFilter?: string, tbs: string = "qdr:m") {
    try {
      const response = await fetch("https://api.firecrawl.dev/v1/search", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query, limit, tbs, scrapeOptions: { formats: ["markdown"] } }),
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
    // Try specific search first
    let [soldResults, activeResults, tcgResults] = await Promise.all([
      searchSold(`"${specific}" sold site:ebay.com`, 10),
      doSearch(`"${specific}" site:ebay.com`, 8, "ebay.com"),
      isSportsCard ? Promise.resolve([]) : doSearch(`"${specific}" price site:tcgplayer.com`, 6, "tcgplayer.com"),
    ]);

    // Fallback to broader search if specific returned few results
    const totalSpecific = soldResults.length + activeResults.length + tcgResults.length;
    if (totalSpecific < 3 && broad !== specific) {
      console.log("Specific search yielded few results, trying broader search...");
      const [soldBroad, activeBroad, tcgBroad] = await Promise.all([
        searchSold(`${broad} sold site:ebay.com`, 10),
        doSearch(`${broad} site:ebay.com`, 8, "ebay.com"),
        isSportsCard ? Promise.resolve([]) : doSearch(`${broad} price site:tcgplayer.com`, 6, "tcgplayer.com"),
      ]);
      if (soldBroad.length + activeBroad.length + tcgBroad.length > totalSpecific) {
        soldResults = soldBroad;
        activeResults = activeBroad;
        tcgResults = tcgBroad;
      }
    }

    // Third-tier fallback: just the card name
    const totalAfterBroad = soldResults.length + activeResults.length + tcgResults.length;
    if (totalAfterBroad < 3 && fallback !== broad) {
      console.log("Broad search yielded few results, trying fallback search...");
      const [soldFallback, activeFallback] = await Promise.all([
        searchSold(`${fallback} sold site:ebay.com`, 10),
        doSearch(`${fallback} site:ebay.com`, 8, "ebay.com"),
      ]);
      if (soldFallback.length + activeFallback.length > totalAfterBroad) {
        soldResults = soldFallback;
        activeResults = activeFallback;
      }
    }

    console.log(`Market results: ${soldResults.length} eBay sold, ${activeResults.length} eBay active, ${tcgResults.length} TCGPlayer`);

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

    if (soldPrices.length === 0 && activePrices.length === 0 && tcgPrices.length === 0) return empty;

    const medianSold = median(soldPrices);
    const medianActive = median(activePrices);
    const medianTcg = median(tcgPrices);

    // Build extractedMarketData
    const sources: MarketSourceData[] = [];
    if (soldPrices.length > 0) sources.push({ source: "ebay_sold", median: medianSold, low: Math.min(...soldPrices), high: Math.max(...soldPrices), count: soldPrices.length, prices: soldPrices });
    if (activePrices.length > 0) sources.push({ source: "ebay_active", median: medianActive, low: Math.min(...activePrices), high: Math.max(...activePrices), count: activePrices.length, prices: activePrices });
    if (tcgPrices.length > 0) sources.push({ source: "tcgplayer", median: medianTcg, low: Math.min(...tcgPrices), high: Math.max(...tcgPrices), count: tcgPrices.length, prices: tcgPrices });

    // Compute blended value
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

    const extractedMarketData: ExtractedMarketData = { sources, blended };

    let summary = "\n\n## REAL MARKET PRICE DATA (retrieved today from multiple sources)\n";
    summary += `Card searched: ${specific}\n`;

    if (soldPrices.length > 0) {
      summary += `\n### eBay SOLD LISTINGS (last 30 days):\n`;
      summary += `- Filtered prices: ${soldPrices.map((p) => `$${p.toFixed(2)}`).join(", ")}\n`;
      summary += `- Median sold price: $${medianSold.toFixed(2)}\n`;
      summary += `- Range: $${Math.min(...soldPrices).toFixed(2)} - $${Math.max(...soldPrices).toFixed(2)}\n`;
      summary += `- Count: ${soldPrices.length} price points\n`;
      summary += `\nDetails:\n${soldListings.join("\n")}\n`;
    }
    if (activePrices.length > 0) {
      summary += `\n### eBay ACTIVE LISTINGS (current asking prices):\n`;
      summary += `- Filtered prices: ${activePrices.map((p) => `$${p.toFixed(2)}`).join(", ")}\n`;
      summary += `- Median asking price: $${medianActive.toFixed(2)}\n`;
      summary += `- Range: $${Math.min(...activePrices).toFixed(2)} - $${Math.max(...activePrices).toFixed(2)}\n`;
      summary += `\nDetails:\n${activeListings.join("\n")}\n`;
    }
    if (tcgPrices.length > 0) {
      summary += `\n### TCGPlayer PRICES:\n`;
      summary += `- Filtered prices: ${tcgPrices.map((p) => `$${p.toFixed(2)}`).join(", ")}\n`;
      summary += `- Median TCGPlayer price: $${medianTcg.toFixed(2)}\n`;
      summary += `- Range: $${Math.min(...tcgPrices).toFixed(2)} - $${Math.max(...tcgPrices).toFixed(2)}\n`;
      summary += `\nDetails:\n${tcgListings.join("\n")}\n`;
    }

    if (blended) {
      summary += `\n### SUGGESTED BLENDED VALUE: $${blended.median.toFixed(2)}`;
      summary += `\n(Weights: eBay sold 50%, TCGPlayer 30%, eBay active 20% — normalized to available sources)\n`;
    }

    summary += `\nCRITICAL: Your estimatedValueLow and estimatedValueHigh MUST be within the range of these real prices. Do NOT ignore this data.\n`;

    return { summary, hasData: true, extractedMarketData };
  } catch (err) {
    console.error("Market price search failed:", err);
    return empty;
  }
}

// Claude verification of pricing
async function verifyWithClaude(
  cardId: CardIdentification,
  analysis: any,
  marketSummary: string,
  ANTHROPIC_API_KEY: string
): Promise<{ verifiedLow: number; verifiedHigh: number; verificationNote: string } | null> {
  try {
    console.log("Running Claude price verification...");
    const prompt = `You are a trading card price verification expert. Verify this estimate against the real market data.

Card: ${cardId.card_name} ${cardId.card_number || ""} ${cardId.variant || ""} (${cardId.card_set || ""} ${cardId.card_year || ""})
Condition: ${analysis.conditionGrade || "Unknown"}

AI estimated value: $${safeFixed(analysis.estimatedValueLow)} - $${safeFixed(analysis.estimatedValueHigh)}

${marketSummary}

TASK: Based ONLY on the real market data above, determine the correct value range for this card.
- If the AI estimate is wildly wrong (e.g., $5-50 when data shows $100+), CORRECT IT.
- Your verified_low should be approximately the blended value × 0.85
- Your verified_high should be approximately the blended value × 1.15
- Adjust based on condition relative to what's described in listings.

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
        model: "claude-sonnet-4-5",
        max_tokens: 2048,
        thinking: { type: "enabled", budget_tokens: 1024 },
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      console.error("Claude verification failed:", response.status);
      return null;
    }

    const data = await response.json();
    // With extended thinking enabled, content may include thinking blocks; pick the text block
    const textBlock = (data.content || []).find((b: any) => b?.type === "text");
    const text = textBlock?.text || data.content?.[0]?.text;
    if (!text) return null;

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const result = JSON.parse(jsonMatch[0]);
    return {
      verifiedLow: result.verified_low,
      verifiedHigh: result.verified_high,
      verificationNote: result.verification_note,
    };
  } catch (err) {
    console.error("Claude verification error:", err);
    return null;
  }
}

// Detailed card identification via Claude
async function identifyCard(
  images: { label: string; url: string }[],
  ANTHROPIC_API_KEY: string
): Promise<CardIdentification | null> {
  try {
    const systemPrompt = `You are a trading card identification expert. Look at this card image VERY carefully. Read ALL text on the card including:
- The card name (character/player name)
- The card NUMBER (e.g., "105/086", "25/198") - look at bottom of card
- The full set/series name and any set symbols
- The year of release
- The variant type (Illustration Rare, Full Art, Alt Art, Holo, Reverse Holo, Regular, etc.)
- The rarity symbol and level

Be EXTREMELY specific. Do NOT return generic names. Include the card number and variant type.

Respond with ONLY valid JSON in this exact format:
{
  "card_name": "Full character/player name on the card",
  "card_number": "Card number as printed (e.g., '105/086'). Empty string if not visible.",
  "card_set": "Full set/series name",
  "card_year": "Year of release",
  "variant": "Variant type: Illustration Rare, Full Art, Alt Art, Holo, Reverse Holo, Regular, etc.",
  "rarity": "Rarity level"
}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-opus-4-5",
        max_tokens: 1024,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Identify this trading card with maximum specificity. Read the card number, variant type, and all visible text." },
              ...images.slice(0, 1).map((img) => ({
                type: "image" as const,
                source: { type: "url" as const, url: img.url },
              })),
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error("Identification call failed:", response.status);
      return null;
    }

    const data = await response.json();
    const text = data.content?.[0]?.text;
    if (!text) return null;

    const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/) || text.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : text;
    return JSON.parse(jsonStr);
  } catch (err) {
    console.error("Card identification failed:", err);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - missing authorization header' }), 
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    
    if (!supabaseUrl || !supabaseAnonKey) throw new Error("Server configuration error");

    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Authenticated user:", user.id);

    const supabaseAdmin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');

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
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");

    const images: { label: string; url: string }[] = body.images || [];
    if (images.length === 0 && body.imageUrl) {
      images.push({ label: "Front", url: body.imageUrl });
    }

    if (images.length === 0) {
      return new Response(
        JSON.stringify({ error: "At least one image is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate all URLs
    const ALLOWED_BUCKET = 'card-images';
    const signedUrlPattern = `${supabaseUrl}/storage/v1/object/sign/${ALLOWED_BUCKET}/`;

    for (const img of images) {
      if (!img.url.startsWith(signedUrlPattern)) {
        return new Response(
          JSON.stringify({ error: `Invalid image URL for "${img.label}" - must be from card-images bucket` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const validExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    for (const img of images) {
      try {
        const url = new URL(img.url);
        const pathParts = url.pathname.split('/');
        const bucketIndex = pathParts.indexOf('card-images');
        if (bucketIndex === -1 || bucketIndex + 1 >= pathParts.length) throw new Error("Invalid path");
        const imageUserId = pathParts[bucketIndex + 1];
        if (imageUserId !== user.id) {
          return new Response(
            JSON.stringify({ error: 'Unauthorized - can only analyze your own images' }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const urlPath = url.pathname.toLowerCase();
        if (!validExtensions.some(ext => urlPath.includes(ext))) {
          return new Response(
            JSON.stringify({ error: `Invalid file type for "${img.label}" - must be an image` }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } catch (urlParseError) {
        return new Response(
          JSON.stringify({ error: 'Invalid image URL format' }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    console.log(`Analyzing ${images.length} image(s) for user:`, user.id);

    // ===== STEP 1: Detailed identification with Claude Sonnet =====
    console.log("Step 1: Identifying card with Claude Sonnet...");
    const cardId = await identifyCard(images, ANTHROPIC_API_KEY);
    console.log("Card identified (detailed):", JSON.stringify(cardId));

    // ===== STEP 2: Search eBay + TCGPlayer with specific details =====
    let marketData: { summary: string; hasData: boolean; extractedMarketData: ExtractedMarketData } = { summary: "", hasData: false, extractedMarketData: { sources: [], blended: null } };
    if (cardId?.card_name) {
      console.log("Step 2: Searching eBay + TCGPlayer with specific query...");
      marketData = await searchMarketPrices(cardId, body.category);
      console.log("Market data found:", marketData.hasData ? "Yes" : "No");
    }

    // ===== STEP 3: Full analysis with Claude =====
    const today = new Date().toISOString().split("T")[0];

    const systemPrompt = `You are an expert trading card analyst, appraiser, and professional grader. Today's date is ${today}.

CRITICAL PRICING INSTRUCTIONS:
${marketData.hasData ? `You are provided with REAL recent market price data from eBay (sold + active listings) AND TCGPlayer with extracted dollar amounts below.

VALUATION FORMULA (you MUST follow this):
1. Look at the eBay SOLD listing prices — these are your primary anchor (50% weight).
2. Look at the TCGPlayer prices — these are your secondary anchor (30% weight).
3. Look at the eBay ACTIVE listing prices — these supplement your estimate (20% weight).
4. Compute a weighted average from available sources (normalize weights to sources found).
5. Adjust this value ±15% based on the specific card's condition relative to what's described in the listings.
6. Set estimatedValueLow = adjusted value × 0.85, estimatedValueHigh = adjusted value × 1.15.
7. If market data clearly shows cards selling for $100+, your estimate MUST reflect that — NOT $5-15.
8. Compare the card's condition to what the listings describe. Better condition → estimate toward high end. Worse → low end.

Your estimates MUST be anchored to the real price data. Do NOT override real market data with training knowledge.` : `You do NOT have access to real-time market data. Your training data may contain OUTDATED prices.

CRITICAL NO-MARKET-DATA RULES:
1. If you cannot confidently identify the exact card variant, ASSUME it is a common/base version.
2. For sports cards without market data, estimate conservatively — most raw base cards are worth $1-$20 unless they are rookies, autos, or numbered parallels.
3. NEVER estimate above $100 without market data unless the card is clearly a rare insert, autograph, or serial-numbered parallel that you can specifically identify.
4. Set confidence to "low" and clearly state that values are rough estimates without live market verification.
5. Use a WIDE value range (±50%) to communicate uncertainty.
6. For any card you estimate above $50 without market data, you MUST explain exactly why in confidenceReason (e.g., "rookie card", "autograph", "numbered /25").`}

When shown an image of a trading card, you will:

1. IDENTIFY the card completely:
   - Card name, card number, set/series, year, edition, rarity, variant/parallel type

2. PERFORM DETAILED PRE-GRADING ANALYSIS:
   a) CENTERING (1-10): left/right and top/bottom percentages
   b) CORNERS (1-10): examine all four corners
   c) EDGES (1-10): chipping, whitening, roughness
   d) SURFACE (1-10): scratches, scuffs, holo condition
   e) OVERALL GRADE PREDICTION: PSA, BGS, CGC, SGC
   f) DEFECT MAP: list each visible flaw with normalized image coordinates (x,y both between 0 and 1, where 0,0 is the top-left of the card and 1,1 is the bottom-right). Mark which side the flaw is on. Limit to the 6 most important flaws. If the card is pristine, return an empty defects array.

3. IDENTIFY special features

4. PROVIDE MARKET RESEARCH:
   ${marketData.hasData ? "Use the REAL market price data provided. The extracted prices and computed medians are your valuation anchors." : "Provide your best estimate but flag confidence as low if uncertain."}

5. PRICE FACTORS

6. GRADED VALUE ESTIMATES

Respond with ONLY valid JSON (no markdown code fences) with this structure:
{
  "category": "string",
  "cardName": "string",
  "cardSet": "string", 
  "cardYear": "string",
  "edition": "string",
  "rarity": "string",
  "cardNumber": "string or null",
  "parallelVariant": "string or null",
  "conditionGrade": "string",
  "conditionNotes": "string",
  "preGradingAnalysis": {
    "centering": { "score": number, "frontLeftRight": "string", "frontTopBottom": "string", "backLeftRight": "string", "backTopBottom": "string", "notes": "string", "psa10Eligible": boolean },
    "corners": { "score": number, "topLeft": "string", "topRight": "string", "bottomLeft": "string", "bottomRight": "string", "notes": "string" },
    "edges": { "score": number, "top": "string", "bottom": "string", "left": "string", "right": "string", "notes": "string" },
    "surface": { "score": number, "front": "string", "back": "string", "holoCondition": "string or null", "notes": "string" },
    "overallScore": number,
    "predictedGrades": { "psa": number, "bgs": number, "cgc": number, "sgc": number },
    "bgsSubgrades": { "centering": number, "corners": number, "edges": number, "surface": number },
    "gradingRecommendation": "string"
  },
  "defects": [
    { "type": "corner_wear" | "edge_ding" | "scratch" | "print_line" | "whitening" | "centering_offset" | "crease" | "stain", "side": "front" | "back", "x": number, "y": number, "severity": "minor" | "moderate" | "severe", "note": "string" }
  ],
  "specialFeatures": ["array"],
  "estimatedValueLow": number,
  "estimatedValueHigh": number,
  "valueCurrency": "USD",
  "ebayRecentSales": { "description": "string", "averagePrice": number, "lowPrice": number, "highPrice": number, "recentSalesCount": "string", "notableSales": ["array"] },
  "tcgplayerPrice": { "marketPrice": number, "lowPrice": number, "midPrice": number, "highPrice": number, "description": "string" },
  "psaPopulation": { "description": "string", "estimatedPopulation": "string", "gradedPremium": "string", "recentGradedSales": ["array"] },
  "gradedValueEstimates": {
    "currentGradeEstimate": "string",
    "worthGrading": boolean,
    "worthGradingReason": "string",
    "recommendedGrader": "PSA",
    "recommendedGraderReason": "string",
    "psa": { "estimatedGrade": number, "valueAtGrade": number, "valueAtPSA10": number, "valueAtPSA9": number, "valueAtPSA8": number, "gradingCost": number, "turnaroundTime": "string" },
    "bgs": { "estimatedGrade": number, "valueAtGrade": number, "valueAtBGS10": number, "valueAtBGS9_5": number, "valueAtBGS9": number, "gradingCost": number, "turnaroundTime": "string", "blackLabelPotential": "string" },
    "cgc": { "estimatedGrade": number, "valueAtGrade": number, "valueAtCGC10": number, "valueAtCGC9_5": number, "valueAtCGC9": number, "gradingCost": number, "turnaroundTime": "string" },
    "sgc": { "estimatedGrade": number, "valueAtGrade": number, "valueAtSGC10": number, "valueAtSGC9_5": number, "valueAtSGC9": number, "gradingCost": number, "turnaroundTime": "string" }
  },
  "priceFactors": ["array"],
  "valueTrend": "rising" | "stable" | "falling" | "unknown",
  "trendReason": "string",
  "confidence": "high" | "medium" | "low",
  "confidenceReason": "string",
  "investmentOutlook": "string",
  "additionalNotes": "string",
  "dataSource": "string"
}`;

    const userMessage = images.length > 1
      ? `I'm providing ${images.length} images of this collectible item (${images.map(i => i.label).join(", ")}). Please analyze all views together for a comprehensive identification, condition assessment, and value estimate.`
      : "Please analyze this trading card image and provide a complete identification, condition assessment, and value estimate.";

    const fullUserMessage = userMessage + marketData.summary;

    console.log("Step 3: Full analysis with Claude,", marketData.hasData ? "real market data" : "AI-only estimates");

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 8192,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: fullUserMessage },
              ...images.map((img) => ({
                type: "image" as const,
                source: { type: "url" as const, url: img.url },
              })),
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Claude API error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw new Error(`Claude API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.content?.[0]?.text;

    if (!content) throw new Error("No response from AI");

    console.log("AI response received for user:", user.id);

    let analysis;
    try {
      const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/) || content.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
      analysis = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error("Failed to parse AI response as JSON:", parseError);
      analysis = {
        cardName: "Unable to identify",
        cardSet: "Unknown",
        cardYear: "Unknown",
        edition: "Unknown",
        rarity: "Unknown",
        conditionGrade: "Unknown",
        conditionNotes: "Could not analyze the card properly. Please try with a clearer image.",
        specialFeatures: [],
        estimatedValueLow: 0,
        estimatedValueHigh: 0,
        valueCurrency: "USD",
        ebayRecentSales: { description: "Unable to estimate", averagePrice: null },
        tcgplayerPrice: { marketPrice: null, description: "Unable to estimate" },
        psaPopulation: { description: "Unknown", note: "" },
        valueTrend: "unknown",
        confidence: "low",
        additionalNotes: "The AI was unable to properly analyze this image. Please ensure the card is clearly visible and try again.",
        dataSource: "Analysis failed",
      };
    }

    if (!analysis.dataSource) {
      analysis.dataSource = marketData.hasData
        ? "Real eBay + TCGPlayer data + AI analysis"
        : "AI estimate only - no live market data available";
    }

    // ===== NO-MARKET-DATA GUARDRAILS =====
    if (!marketData.hasData) {
      // Force low confidence
      analysis.confidence = "low";
      analysis.noMarketData = true;
      analysis.confidenceReason = (analysis.confidenceReason || "") + " No real-time market data was found — values are AI estimates only and may be significantly inaccurate.";

      // Cap unreasonable AI-only estimates
      const highVal = Number(analysis.estimatedValueHigh) || 0;
      const lowVal = Number(analysis.estimatedValueLow) || 0;

      if (highVal > 100) {
        // Check if card has identifiable high-value traits
        const hasHighValueTraits = /auto(graph)?|numbered|\/\d{1,3}$|1st edition|rookie|rc|parallel|refractor|prismatic/i.test(
          `${analysis.rarity || ""} ${analysis.parallelVariant || ""} ${analysis.specialFeatures?.join(" ") || ""} ${analysis.edition || ""}`
        );

        if (!hasHighValueTraits) {
          // Cap at $100 for unverified common cards
          analysis.estimatedValueHigh = Math.min(highVal, 100);
          analysis.estimatedValueLow = Math.min(lowVal, analysis.estimatedValueHigh * 0.5);
          analysis.valuationWarning = "High value estimated without market verification — capped at conservative estimate. Re-scan to check for updated pricing.";
          console.log(`Capped AI-only estimate from $${lowVal}-$${highVal} to $${analysis.estimatedValueLow}-$${analysis.estimatedValueHigh}`);
        } else {
          // Has high-value traits but still widen the range
          analysis.estimatedValueLow = Math.round(lowVal * 0.5);
          analysis.estimatedValueHigh = Math.round(highVal * 1.5);
          analysis.valuationWarning = "High value estimated without market verification — treat as rough estimate. Re-scan to check for updated pricing.";
        }
      } else {
        // Widen range for uncertainty
        analysis.estimatedValueLow = Math.round(lowVal * 0.5);
        analysis.estimatedValueHigh = Math.round(highVal * 1.5);
      }
    }

    // ===== STEP 4: Claude Price Verification =====
    if (marketData.hasData && analysis.estimatedValueLow != null && cardId) {
      const verification = await verifyWithClaude(cardId, analysis, marketData.summary, ANTHROPIC_API_KEY);

      if (verification) {
        const origLow = analysis.estimatedValueLow;
        const origHigh = analysis.estimatedValueHigh;
        analysis.estimatedValueLow = verification.verifiedLow;
        analysis.estimatedValueHigh = verification.verifiedHigh;
        analysis.verificationNote = verification.verificationNote;
        if (origLow !== verification.verifiedLow || origHigh !== verification.verifiedHigh) {
          analysis.dataSource = `Real eBay + TCGPlayer data + AI analysis (Claude-verified & corrected from $${safeFixed(origLow)}-$${safeFixed(origHigh)})`;
          console.log(`Price corrected: $${origLow}-$${origHigh} → $${verification.verifiedLow}-$${verification.verifiedHigh}`);
        } else {
          analysis.dataSource = "Real eBay + TCGPlayer data + AI analysis (Claude-verified ✓)";
        }
      }
    }

    // ===== STEP 5: Save card server-side, then deduct credit =====
    // Extract the file path from the signed URL
    const firstImageUrl = images[0]?.url || "";
    let imagePath = "";
    try {
      const urlObj = new URL(firstImageUrl);
      const pathParts = urlObj.pathname.split("/");
      const bucketIndex = pathParts.indexOf("card-images");
      if (bucketIndex !== -1) {
        imagePath = pathParts.slice(bucketIndex + 1).join("/");
      }
    } catch { imagePath = ""; }

    if (!imagePath) {
      // Fallback: use the body's filePath if provided
      imagePath = body.filePath || firstImageUrl;
    }

    // Duplicate prevention: check if card with same image_url exists
    const { data: existingCard } = await supabaseAdmin
      .from("cards")
      .select("id")
      .eq("user_id", user.id)
      .eq("image_url", imagePath)
      .maybeSingle();

    if (existingCard) {
      console.log("Duplicate card detected, returning existing card:", existingCard.id);
      return new Response(JSON.stringify({ ...analysis, extractedMarketData: marketData.extractedMarketData, cardId: existingCard.id, duplicate: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Insert card into DB
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
      // Still return analysis so client can attempt manual save
      return new Response(JSON.stringify({ ...analysis, extractedMarketData: marketData.extractedMarketData, saveError: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Card saved server-side:", savedCard.id);

    // Insert price history
    if (marketData.extractedMarketData && savedCard.id) {
      const priceRows: any[] = [];
      const emd = marketData.extractedMarketData;
      if (emd.sources) {
        for (const src of emd.sources) {
          priceRows.push({
            card_id: savedCard.id,
            user_id: user.id,
            source: src.source,
            median_price: src.median,
            low_price: src.low,
            high_price: src.high,
            price_count: src.count,
            raw_prices: src.prices,
          });
        }
      }
      if (emd.blended) {
        priceRows.push({
          card_id: savedCard.id,
          user_id: user.id,
          source: "blended",
          median_price: emd.blended.median,
          low_price: emd.blended.low,
          high_price: emd.blended.high,
          price_count: 0,
          raw_prices: [],
        });
      }
      if (priceRows.length > 0) {
        await supabaseAdmin.from("price_history").insert(priceRows);
      }
    }

    // NOW deduct credit (only after card is saved)
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

    return new Response(JSON.stringify({ ...analysis, extractedMarketData: marketData.extractedMarketData, cardId: savedCard.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in analyze-card function:", error);
    return new Response(
      JSON.stringify({ error: "An error occurred while analyzing the card" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
