import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

// Helper: search market listings via Firecrawl and return structured price data
async function searchMarketPrices(
  cardName: string,
  cardSet: string,
  cardYear: string
): Promise<{ summary: string; hasData: boolean; extractedMarketData: ExtractedMarketData }> {
  const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
  const emptyMarket: ExtractedMarketData = { sources: [], blended: null };
  const empty = { summary: "", hasData: false, extractedMarketData: emptyMarket };
  if (!FIRECRAWL_API_KEY) {
    console.log("FIRECRAWL_API_KEY not available, skipping market search");
    return empty;
  }

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

    console.log(`Market results: ${soldResults.length} eBay sold, ${activeResults.length} eBay active, ${tcgResults.length} TCGPlayer`);

    const soldPrices: number[] = [];
    const soldListings = soldResults.slice(0, 8).map((r: any) => {
      const text = `${r.title || ""} ${r.description || ""} ${(r.markdown || "").substring(0, 800)}`;
      const prices = extractPrices(text);
      soldPrices.push(...prices);
      return `- ${r.title || "Listing"} | Prices: ${prices.length > 0 ? prices.map((p) => `$${p.toFixed(2)}`).join(", ") : "none detected"}`;
    });

    const activePrices: number[] = [];
    const activeListings = activeResults.slice(0, 6).map((r: any) => {
      const text = `${r.title || ""} ${r.description || ""} ${(r.markdown || "").substring(0, 800)}`;
      const prices = extractPrices(text);
      activePrices.push(...prices);
      return `- ${r.title || "Listing"} | Prices: ${prices.length > 0 ? prices.map((p) => `$${p.toFixed(2)}`).join(", ") : "none detected"}`;
    });

    const tcgPrices: number[] = [];
    const tcgListings = tcgResults.slice(0, 5).map((r: any) => {
      const text = `${r.title || ""} ${r.description || ""} ${(r.markdown || "").substring(0, 800)}`;
      const prices = extractPrices(text);
      tcgPrices.push(...prices);
      return `- ${r.title || "Listing"} | Prices: ${prices.length > 0 ? prices.map((p) => `$${p.toFixed(2)}`).join(", ") : "none detected"}`;
    });

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

    if (soldPrices.length > 0) {
      summary += `\n### eBay SOLD LISTINGS (last 30 days):\n`;
      summary += `- All prices found: ${soldPrices.map((p) => `$${p.toFixed(2)}`).join(", ")}\n`;
      summary += `- Median sold price: $${medianSold.toFixed(2)}\n`;
      summary += `- Range: $${Math.min(...soldPrices).toFixed(2)} - $${Math.max(...soldPrices).toFixed(2)}\n`;
      summary += `- Count: ${soldPrices.length} price points\n`;
      summary += `\nDetails:\n${soldListings.join("\n")}\n`;
    }
    if (activePrices.length > 0) {
      summary += `\n### eBay ACTIVE LISTINGS (current asking prices):\n`;
      summary += `- All prices found: ${activePrices.map((p) => `$${p.toFixed(2)}`).join(", ")}\n`;
      summary += `- Median asking price: $${medianActive.toFixed(2)}\n`;
      summary += `- Range: $${Math.min(...activePrices).toFixed(2)} - $${Math.max(...activePrices).toFixed(2)}\n`;
      summary += `\nDetails:\n${activeListings.join("\n")}\n`;
    }
    if (tcgPrices.length > 0) {
      summary += `\n### TCGPlayer PRICES:\n`;
      summary += `- All prices found: ${tcgPrices.map((p) => `$${p.toFixed(2)}`).join(", ")}\n`;
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

// Helper: AI verification of estimated value against market data
async function verifyPriceWithAI(
  analysis: any,
  marketSummary: string,
  LOVABLE_API_KEY: string
): Promise<{ verifiedLow: number; verifiedHigh: number; verificationNote: string } | null> {
  if (!marketSummary || !analysis?.estimatedValueLow) return null;

  try {
    console.log("Running AI price verification...");
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
            content: `You are a price verification AI. Your ONLY job is to check if a card's estimated value is reasonable given real market data. Be precise and numerical.`,
          },
          {
            role: "user",
            content: `A card analysis estimated this card at $${analysis.estimatedValueLow} - $${analysis.estimatedValueHigh}.

Card: ${analysis.cardName || "Unknown"} (${analysis.cardSet || ""} ${analysis.cardYear || ""})
Condition: ${analysis.conditionGrade || "Unknown"}

Here is the REAL market data:
${marketSummary}

Verify if the estimate is reasonable. If the real data shows significantly different prices, correct the estimate. Return corrected values.`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "verify_price",
              description: "Return verified price range and a note about the verification.",
              parameters: {
                type: "object",
                properties: {
                  verified_low: { type: "number", description: "Corrected low estimate in USD" },
                  verified_high: { type: "number", description: "Corrected high estimate in USD" },
                  verification_note: { type: "string", description: "Brief explanation of any corrections made or confirmation that estimate is accurate" },
                },
                required: ["verified_low", "verified_high", "verification_note"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "verify_price" } },
      }),
    });

    if (!response.ok) {
      console.error("Price verification failed:", response.status);
      return null;
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) return null;

    const result = JSON.parse(toolCall.function.arguments);
    console.log("Price verification result:", result);
    return {
      verifiedLow: result.verified_low,
      verifiedHigh: result.verified_high,
      verificationNote: result.verification_note,
    };
  } catch (err) {
    console.error("Price verification error:", err);
    return null;
  }
}

// Helper: quick identification call to get card name/set/year from image
async function identifyCard(
  images: { label: string; url: string }[],
  LOVABLE_API_KEY: string
): Promise<{ card_name: string; card_set: string; card_year: string } | null> {
  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
            content: "You are a trading card identification expert. Look at this card image and identify ONLY the card name, set/series, and year. Return ONLY JSON.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Identify this card. Return only: card_name, card_set, card_year." },
              ...images.slice(0, 1).map((img) => ({
                type: "image_url" as const,
                image_url: { url: img.url },
              })),
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

    if (!response.ok) {
      console.error("Identification call failed:", response.status);
      return null;
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) return null;

    return JSON.parse(toolCall.function.arguments);
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
    // Authenticate the request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error("Missing authorization header");
      return new Response(
        JSON.stringify({ error: 'Unauthorized - missing authorization header' }), 
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("Missing Supabase configuration");
      throw new Error("Server configuration error");
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      console.error("Auth error:", authError?.message || "Invalid token");
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Authenticated user:", user.id);

    // Credit check
    const supabaseAdmin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
    const { data: creditsData } = await supabaseAdmin
      .from("user_credits")
      .select("credits, plan")
      .eq("user_id", user.id)
      .single();

    const isPro = creditsData?.plan === "pro";
    const hasCredits = (creditsData?.credits ?? 0) > 0;

    if (!isPro && !hasCredits) {
      console.log("Insufficient credits for user:", user.id);
      return new Response(
        JSON.stringify({ error: "Insufficient credits. Please purchase credits or upgrade to Pro." }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Support both new multi-image format and legacy single imageUrl
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
        console.error("Invalid image URL origin:", img.url.substring(0, 100));
        return new Response(
          JSON.stringify({ error: `Invalid image URL for "${img.label}" - must be from card-images bucket` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Validate ownership and file type
    const validExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    for (const img of images) {
      try {
        const url = new URL(img.url);
        const pathParts = url.pathname.split('/');
        const bucketIndex = pathParts.indexOf('card-images');
        if (bucketIndex === -1 || bucketIndex + 1 >= pathParts.length) {
          throw new Error("Invalid path structure");
        }
        const imageUserId = pathParts[bucketIndex + 1];
        if (imageUserId !== user.id) {
          console.error("User ID mismatch for", img.label);
          return new Response(
            JSON.stringify({ error: 'Unauthorized - can only analyze your own images' }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const urlPath = url.pathname.toLowerCase();
        const hasValidExt = validExtensions.some(ext => urlPath.includes(ext));
        if (!hasValidExt) {
          return new Response(
            JSON.stringify({ error: `Invalid file type for "${img.label}" - must be an image` }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } catch (urlParseError) {
        console.error("Failed to parse image URL:", urlParseError);
        return new Response(
          JSON.stringify({ error: 'Invalid image URL format' }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    console.log(`Analyzing ${images.length} image(s) for user:`, user.id);

    // ===== STEP 1: Quick identification to get card name/set/year =====
    console.log("Step 1: Identifying card...");
    const cardId = await identifyCard(images, LOVABLE_API_KEY);
    console.log("Card identified:", cardId);

    // ===== STEP 2: Search eBay + TCGPlayer listings with Firecrawl =====
    let marketData = { summary: "", hasData: false };
    if (cardId?.card_name) {
      console.log("Step 2: Searching eBay + TCGPlayer listings...");
      marketData = await searchMarketPrices(
        cardId.card_name,
        cardId.card_set || "",
        cardId.card_year || ""
      );
      console.log("Market data found:", marketData.hasData ? "Yes" : "No");
    }

    // ===== STEP 3: Full analysis with real market data =====
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

Your estimates MUST be anchored to the real price data. Do NOT override real market data with training knowledge.` : `You do NOT have access to real-time market data. Your training data may contain OUTDATED prices. Be VERY conservative with value estimates. If you are not confident about current market prices, set confidence to "low" and clearly state that values are estimates that may not reflect the current market. It is better to provide a wider range than to give a confidently wrong narrow range.`}

When shown an image of a trading card, you will:

1. IDENTIFY the card completely:
   - Card name (character, player, or item name)
   - Card set/series name
   - Year of release
   - Edition (1st Edition, Unlimited, Shadowless, etc.)
   - Rarity (Common, Uncommon, Rare, Ultra Rare, Secret Rare, etc.)
   - Card number if visible
   - Parallel/Variant type if applicable (Refractor, Prizm, Rainbow, etc.)

2. PERFORM DETAILED PRE-GRADING ANALYSIS (like a professional grader):
   Analyze each attribute on a scale of 1-10 and provide specific observations:
   
   a) CENTERING (1-10):
      - Measure left/right and top/bottom centering percentages
      - Note if centering meets PSA 10 standards (60/40 or better front, 75/25 back)
      - Identify any print shifts or off-center cuts
   
   b) CORNERS (1-10):
      - Examine all four corners for whitening, dings, or wear
      - Check for factory defects vs handling damage
      - Note any layering or peeling
   
   c) EDGES (1-10):
      - Look for chipping, whitening, or roughness along all edges
      - Check for factory cutting issues
      - Note any nicks or notches
   
   d) SURFACE (1-10):
      - Check for scratches, scuffs, or print lines
      - Look for holo scratching on holographic cards
      - Note any staining, residue, or fingerprints
      - Check for creases or dents
   
   e) OVERALL GRADE PREDICTION:
      - Provide predicted grade for PSA, BGS, CGC, and SGC
      - Calculate sub-grade breakdown for BGS style grading

3. IDENTIFY special features:
   - Holographic/Foil patterns
   - First Edition stamps
   - Error cards (miscuts, misprints, wrong backs)
   - Autographs
   - Special print runs
   - Promotional markings
   - Parallel/Refractor types

4. PROVIDE DETAILED MARKET RESEARCH:
   ${ebayData.summary ? "Use the REAL eBay price data (sold + active) provided. The extracted prices and computed medians are your valuation anchors." : "Provide your best estimate but flag confidence as low if uncertain about current market prices."}
   
   a) eBay Market Data:
      - Recent sold prices for this specific card in similar condition
      - Price range (low, average, high)
      - Number of recent sales activity level
      - Note any outlier sales
   
   b) TCGPlayer Market Data:
      - Current market price
      - Low/Mid/High price points
      - Recent price trends
   
   c) Graded Card Values (if applicable):
      - PSA/BGS population estimates for this grade
      - Premium for graded vs raw
      - Recent auction results for graded copies
   
   d) Market Trend Analysis:
      - Is demand rising, falling, or stable?
      - Any upcoming events that could affect price
      - Collector sentiment

5. PRICE FACTORS - Identify what's driving the value:
   - Rarity and print run
   - Popularity of character/player
   - Condition scarcity at this grade
   - Historical significance
   - Current meta relevance (for playable cards)

6. GRADED VALUE ESTIMATES:
   For each major grading company (PSA, BGS, CGC, SGC), provide:
   - Estimated value at the grade you assessed
   - Estimated value at PSA 10/BGS 10 (Gem Mint)
   - Estimated value at PSA 9/BGS 9.5 (Mint)
   - Estimated value at PSA 8/BGS 8.5 (Near Mint-Mint)
   - Grading cost vs. potential value increase
   - Which grading company would maximize value

Respond in JSON format with this structure:
{
  "category": "string (auto-categorize: 'Pokémon', 'Magic: The Gathering', 'Yu-Gi-Oh!', 'Sports Card', 'Trading Card', 'Comic Book', 'Coin', or 'Other')",
  "cardName": "string",
  "cardSet": "string", 
  "cardYear": "string",
  "edition": "string",
  "rarity": "string",
  "cardNumber": "string or null",
  "parallelVariant": "string or null",
  "conditionGrade": "string (e.g., 'Near Mint (7)')",
  "conditionNotes": "string explaining condition assessment",
  "preGradingAnalysis": {
    "centering": {
      "score": number,
      "frontLeftRight": "string",
      "frontTopBottom": "string",
      "backLeftRight": "string",
      "backTopBottom": "string",
      "notes": "string",
      "psa10Eligible": boolean
    },
    "corners": {
      "score": number,
      "topLeft": "string",
      "topRight": "string",
      "bottomLeft": "string",
      "bottomRight": "string",
      "notes": "string"
    },
    "edges": {
      "score": number,
      "top": "string",
      "bottom": "string",
      "left": "string",
      "right": "string",
      "notes": "string"
    },
    "surface": {
      "score": number,
      "front": "string",
      "back": "string",
      "holoCondition": "string or null",
      "notes": "string"
    },
    "overallScore": number,
    "predictedGrades": { "psa": number, "bgs": number, "cgc": number, "sgc": number },
    "bgsSubgrades": { "centering": number, "corners": number, "edges": number, "surface": number },
    "gradingRecommendation": "string"
  },
  "specialFeatures": ["array"],
  "estimatedValueLow": number,
  "estimatedValueHigh": number,
  "valueCurrency": "USD",
  "ebayRecentSales": {
    "description": "string",
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
    "highPrice": number,
    "description": "string"
  },
  "psaPopulation": {
    "description": "string",
    "estimatedPopulation": "string",
    "gradedPremium": "string",
    "recentGradedSales": ["array"]
  },
  "gradedValueEstimates": {
    "currentGradeEstimate": "string",
    "worthGrading": boolean,
    "worthGradingReason": "string",
    "recommendedGrader": "PSA" | "BGS" | "CGC" | "SGC",
    "recommendedGraderReason": "string",
    "psa": {
      "estimatedGrade": number,
      "valueAtGrade": number,
      "valueAtPSA10": number,
      "valueAtPSA9": number,
      "valueAtPSA8": number,
      "gradingCost": number,
      "turnaroundTime": "string"
    },
    "bgs": {
      "estimatedGrade": number,
      "valueAtGrade": number,
      "valueAtBGS10": number,
      "valueAtBGS9_5": number,
      "valueAtBGS9": number,
      "gradingCost": number,
      "turnaroundTime": "string",
      "blackLabelPotential": "string"
    },
    "cgc": {
      "estimatedGrade": number,
      "valueAtGrade": number,
      "valueAtCGC10": number,
      "valueAtCGC9_5": number,
      "valueAtCGC9": number,
      "gradingCost": number,
      "turnaroundTime": "string"
    },
    "sgc": {
      "estimatedGrade": number,
      "valueAtGrade": number,
      "valueAtSGC10": number,
      "valueAtSGC9_5": number,
      "valueAtSGC9": number,
      "gradingCost": number,
      "turnaroundTime": "string"
    }
  },
  "priceFactors": ["array"],
  "valueTrend": "rising" | "stable" | "falling" | "unknown",
  "trendReason": "string",
  "confidence": "high" | "medium" | "low",
  "confidenceReason": "string",
  "investmentOutlook": "string",
  "additionalNotes": "string",
  "dataSource": "string (e.g., 'Real eBay + TCGPlayer data + AI analysis' or 'AI estimate only - no live market data')"
}`;

    const userMessage = images.length > 1
      ? `I'm providing ${images.length} images of this collectible item (${images.map(i => i.label).join(", ")}). Please analyze all views together for a comprehensive identification, condition assessment, and value estimate.`
      : "Please analyze this trading card image and provide a complete identification, condition assessment, and value estimate.";

    const fullUserMessage = userMessage + marketData.summary;

    console.log("Step 3: Full analysis with", marketData.hasData ? "real market data" : "AI-only estimates");

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
          {
            role: "user",
            content: [
              { type: "text", text: fullUserMessage },
              ...images.map((img) => ({
                type: "image_url" as const,
                image_url: { url: img.url },
              })),
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI usage limit reached. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No response from AI");
    }

    console.log("AI response received for user:", user.id);

    // Parse the JSON response
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

    // Add data source info if not present
    if (!analysis.dataSource) {
      analysis.dataSource = marketData.hasData
        ? "Real eBay + TCGPlayer data + AI analysis (AI-verified)"
        : "AI estimate only - no live market data available";
    }

    // ===== STEP 4: AI Price Verification =====
    if (marketData.hasData && analysis.estimatedValueLow != null) {
      const verification = await verifyPriceWithAI(analysis, marketData.summary, LOVABLE_API_KEY);
      if (verification) {
        const origLow = analysis.estimatedValueLow;
        const origHigh = analysis.estimatedValueHigh;
        analysis.estimatedValueLow = verification.verifiedLow;
        analysis.estimatedValueHigh = verification.verifiedHigh;
        analysis.verificationNote = verification.verificationNote;
        if (origLow !== verification.verifiedLow || origHigh !== verification.verifiedHigh) {
          analysis.dataSource = `Real eBay + TCGPlayer data + AI analysis (AI-verified & corrected from $${safeFixed(origLow)}-$${safeFixed(origHigh)})`;
          console.log(`Price corrected: $${origLow}-$${origHigh} → $${verification.verifiedLow}-$${verification.verifiedHigh}`);
        } else {
          analysis.dataSource = "Real eBay + TCGPlayer data + AI analysis (AI-verified ✓)";
        }
      }
    }

    function safeFixed(val: unknown, digits = 2): string {
      const num = typeof val === 'number' ? val : Number(val);
      return isNaN(num) ? '0' : num.toFixed(digits);
    }

    // Deduct credit for non-Pro users
    if (!isPro) {
      const { data: remaining, error: deductError } = await supabaseAdmin.rpc("deduct_credit", {
        _user_id: user.id,
      });

      if (deductError || remaining === -1) {
        console.error("Failed to deduct credit:", deductError?.message);
        return new Response(
          JSON.stringify({ error: "Insufficient credits. Please purchase credits or upgrade to Pro." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      await supabaseAdmin
        .from("credit_transactions")
        .insert({
          user_id: user.id,
          amount: -1,
          type: "scan",
          description: `AI scan: ${analysis.cardName || "Unknown card"}`,
        });

      console.log("Deducted 1 credit for user:", user.id, "remaining:", remaining);
    }

    return new Response(JSON.stringify({ ...analysis, extractedMarketData: marketData.extractedMarketData }), {
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
