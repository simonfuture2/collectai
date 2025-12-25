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

    const systemPrompt = `You are an expert trading card analyst and appraiser. When shown an image of a trading card, you will:

1. IDENTIFY the card completely:
   - Card name (character, player, or item name)
   - Card set/series name
   - Year of release
   - Edition (1st Edition, Unlimited, etc.)
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

4. ESTIMATE market value based on your knowledge:
   - Provide a low-high price range in USD
   - Reference typical eBay sold prices
   - Reference TCGPlayer market prices
   - Note any PSA/BGS population data you know about
   - Mention if the card is trending up or down

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
    "description": "string describing recent eBay activity",
    "averagePrice": number or null
  },
  "tcgplayerPrice": {
    "marketPrice": number or null,
    "description": "string"
  },
  "psaPopulation": {
    "description": "string about graded population if known",
    "note": "string"
  },
  "valueTrend": "rising" | "stable" | "falling" | "unknown",
  "confidence": "high" | "medium" | "low",
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
