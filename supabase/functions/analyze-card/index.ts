import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageUrl } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    if (!imageUrl) {
      throw new Error("Image URL is required");
    }

    console.log("Analyzing card image:", imageUrl);

    const systemPrompt = `You are an expert trading card analyst, appraiser, and market researcher with deep knowledge of current trading card market prices. When shown an image of a trading card, you will:

1. IDENTIFY the card completely:
   - Card name (character, player, or item name)
   - Card set/series name
   - Year of release
   - Edition (1st Edition, Unlimited, Shadowless, etc.)
   - Rarity (Common, Uncommon, Rare, Ultra Rare, Secret Rare, etc.)
   - Card number if visible

2. ASSESS the condition/grade on a scale similar to PSA:
   - Gem Mint (10)
   - Mint (9)
   - Near Mint-Mint (8)
   - Near Mint (7)
   - Excellent-Mint (6)
   - Excellent (5)
   - Very Good-Excellent (4)
   - Very Good (3)
   - Good (2)
   - Poor (1)
   
   Consider: centering, corners, edges, surface condition, and any visible damage.

3. IDENTIFY special features:
   - Holographic/Foil patterns
   - First Edition stamps
   - Error cards
   - Autographs
   - Special print runs
   - Promotional markings

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

Respond in JSON format with this structure:
{
  "cardName": "string",
  "cardSet": "string", 
  "cardYear": "string",
  "edition": "string",
  "rarity": "string",
  "cardNumber": "string or null",
  "conditionGrade": "string (e.g., 'Near Mint (7)')",
  "conditionNotes": "string explaining condition assessment",
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
                text: "Please analyze this trading card image and provide a complete identification, condition assessment, and value estimate.",
              },
              {
                type: "image_url",
                image_url: { url: imageUrl },
              },
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

    console.log("AI response received:", content.substring(0, 200));

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
        rawResponse: content,
      };
    }

    return new Response(JSON.stringify(analysis), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in analyze-card function:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
