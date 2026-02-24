import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    // Validate ownership and file type for all images
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

    const systemPrompt = `You are an expert trading card analyst, appraiser, and professional grader with deep knowledge of current trading card market prices. When shown an image of a trading card, you will:

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
   Based on your training data and knowledge of the trading card market, provide realistic pricing estimates:
   
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
      - Any upcoming events that could affect price (anniversaries, new releases, etc.)
      - Collector sentiment

5. PRICE FACTORS - Identify what's driving the value:
   - Rarity and print run
   - Popularity of character/player
   - Condition scarcity at this grade
   - Historical significance
   - Current meta relevance (for playable cards)

6. GRADED VALUE ESTIMATES - Provide estimated values if this card were professionally graded:
   For each major grading company (PSA, BGS, CGC, SGC), provide:
   - Estimated value at the grade you assessed (raw card grade equivalent)
   - Estimated value at PSA 10/BGS 10 (Gem Mint)
   - Estimated value at PSA 9/BGS 9.5 (Mint)
   - Estimated value at PSA 8/BGS 8.5 (Near Mint-Mint)
   - Grading cost vs. potential value increase (is it worth grading?)
   - Which grading company would maximize value for this specific card

Respond in JSON format with this structure:
{
  "category": "string (auto-categorize: 'Pokémon', 'Magic: The Gathering', 'Yu-Gi-Oh!', 'Sports Card', 'Trading Card', 'Comic Book', 'Coin', or 'Other')",
  "cardName": "string",
  "cardSet": "string", 
  "cardYear": "string",
  "edition": "string",
  "rarity": "string",
  "cardNumber": "string or null",
  "parallelVariant": "string or null (e.g., 'Refractor', 'Prizm Silver', 'Rainbow Rare')",
  "conditionGrade": "string (e.g., 'Near Mint (7)')",
  "conditionNotes": "string explaining condition assessment",
  "preGradingAnalysis": {
    "centering": {
      "score": number (1-10),
      "frontLeftRight": "string (e.g., '55/45')",
      "frontTopBottom": "string (e.g., '50/50')",
      "backLeftRight": "string (e.g., '60/40')",
      "backTopBottom": "string (e.g., '55/45')",
      "notes": "string with detailed centering observations",
      "psa10Eligible": boolean
    },
    "corners": {
      "score": number (1-10),
      "topLeft": "string describing condition",
      "topRight": "string describing condition",
      "bottomLeft": "string describing condition",
      "bottomRight": "string describing condition",
      "notes": "string with detailed corner observations"
    },
    "edges": {
      "score": number (1-10),
      "top": "string describing condition",
      "bottom": "string describing condition",
      "left": "string describing condition",
      "right": "string describing condition",
      "notes": "string with detailed edge observations"
    },
    "surface": {
      "score": number (1-10),
      "front": "string describing front surface",
      "back": "string describing back surface",
      "holoCondition": "string or null (for holo cards)",
      "notes": "string with detailed surface observations"
    },
    "overallScore": number (average of all scores),
    "predictedGrades": {
      "psa": number,
      "bgs": number,
      "cgc": number,
      "sgc": number
    },
    "bgsSubgrades": {
      "centering": number,
      "corners": number,
      "edges": number,
      "surface": number
    },
    "gradingRecommendation": "string (comprehensive recommendation)"
  },
  "specialFeatures": ["array of special features"],
  "estimatedValueLow": number,
  "estimatedValueHigh": number,
  "valueCurrency": "USD",
  "ebayRecentSales": {
    "description": "detailed description of recent eBay sold listings",
    "averagePrice": number,
    "lowPrice": number,
    "highPrice": number,
    "recentSalesCount": "string describing activity level",
    "notableSales": ["array of notable recent sales with prices"]
  },
  "tcgplayerPrice": {
    "marketPrice": number,
    "lowPrice": number,
    "midPrice": number, 
    "highPrice": number,
    "description": "string describing TCGPlayer market"
  },
  "psaPopulation": {
    "description": "string about graded population",
    "estimatedPopulation": "string",
    "gradedPremium": "string describing premium for graded copies",
    "recentGradedSales": ["array of recent graded sales if known"]
  },
  "gradedValueEstimates": {
    "currentGradeEstimate": "string describing what grade this card would likely receive",
    "worthGrading": boolean,
    "worthGradingReason": "string explaining if grading is worth the cost",
    "recommendedGrader": "PSA" | "BGS" | "CGC" | "SGC",
    "recommendedGraderReason": "string explaining why this grader is recommended",
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
      "blackLabelPotential": "string describing chance of black label"
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
  "priceFactors": ["array of factors influencing the price"],
  "valueTrend": "rising" | "stable" | "falling" | "unknown",
  "trendReason": "string explaining why the trend",
  "confidence": "high" | "medium" | "low",
  "confidenceReason": "string explaining confidence level",
  "investmentOutlook": "string with brief investment perspective",
  "additionalNotes": "string with any other relevant observations"
}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
              {
                type: "text",
                text: images.length > 1
                  ? `I'm providing ${images.length} images of this collectible item (${images.map(i => i.label).join(", ")}). Please analyze all views together for a comprehensive identification, condition assessment, and value estimate.`
                  : "Please analyze this trading card image and provide a complete identification, condition assessment, and value estimate.",
              },
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

    // Parse the JSON response from the AI
    let analysis;
    try {
      // Extract JSON from the response (handle markdown code blocks)
      const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/) || content.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
      analysis = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error("Failed to parse AI response as JSON:", parseError);
      // Return a structured error response
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
      };
    }

    return new Response(JSON.stringify(analysis), {
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
