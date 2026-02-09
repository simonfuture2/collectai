import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate API key
    const COLLECTAI_API_KEY = Deno.env.get("COLLECTAI_API_KEY");
    if (!COLLECTAI_API_KEY) {
      throw new Error("COLLECTAI_API_KEY is not configured");
    }

    const apiKey = req.headers.get("x-api-key");
    if (!apiKey || apiKey !== COLLECTAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Invalid or missing API key" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const { cardName, cardSet, cardYear, edition, rarity, condition, imageUrl } = await req.json();

    if (!cardName && !imageUrl) {
      return new Response(
        JSON.stringify({ error: "Either cardName or imageUrl is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("CollectAI Price API called for:", cardName || "image-based lookup");

    const systemPrompt = `You are an expert trading card market analyst. Provide detailed pricing based on current market data.

Respond in JSON format:
{
  "cardName": "string",
  "cardSet": "string",
  "cardYear": "string",
  "estimatedValueLow": number,
  "estimatedValueHigh": number,
  "valueCurrency": "USD",
  "ebayRecentSales": {
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
    "highPrice": number
  },
  "gradedValues": {
    "psa10": number,
    "psa9": number,
    "psa8": number,
    "bgs10": number,
    "bgs9_5": number
  },
  "valueTrend": "rising" | "stable" | "falling" | "unknown",
  "trendReason": "string",
  "priceFactors": ["array of factors"],
  "confidence": "high" | "medium" | "low"
}`;

    const userContent: any[] = [
      {
        type: "text",
        text: imageUrl
          ? "Identify this card and provide detailed current market pricing."
          : `Provide detailed market pricing for: ${cardName}${cardSet ? `, Set: ${cardSet}` : ""}${cardYear ? `, Year: ${cardYear}` : ""}${edition ? `, Edition: ${edition}` : ""}${rarity ? `, Rarity: ${rarity}` : ""}${condition ? `, Condition: ${condition}` : ""}`,
      },
    ];

    if (imageUrl) {
      userContent.push({ type: "image_url", image_url: { url: imageUrl } });
    }

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
          { role: "user", content: userContent },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI usage limit reached" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) throw new Error("No response from AI");

    let pricing;
    try {
      const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/) || content.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
      pricing = JSON.parse(jsonStr);
    } catch {
      return new Response(
        JSON.stringify({ error: "Failed to parse pricing data" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, source: "CollectAI", data: pricing }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in collectai-price:", error);
    return new Response(
      JSON.stringify({ error: "An error occurred during pricing analysis" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
