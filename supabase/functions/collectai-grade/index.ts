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

    const { imageUrl } = await req.json();

    if (!imageUrl) {
      return new Response(
        JSON.stringify({ error: "imageUrl is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("CollectAI Grade API called with image URL");

    const systemPrompt = `You are an expert trading card grader. Analyze the card image and provide a detailed grading assessment.

Respond in JSON format:
{
  "overallGrade": "string (e.g., 'Near Mint 7')",
  "centering": { "score": number, "frontLeftRight": "string", "frontTopBottom": "string", "notes": "string", "psa10Eligible": boolean },
  "corners": { "score": number, "notes": "string" },
  "edges": { "score": number, "notes": "string" },
  "surface": { "score": number, "notes": "string", "holoCondition": "string or null" },
  "overallScore": number,
  "predictedGrades": { "psa": number, "bgs": number, "cgc": number, "sgc": number },
  "bgsSubgrades": { "centering": number, "corners": number, "edges": number, "surface": number },
  "worthGrading": boolean,
  "worthGradingReason": "string",
  "recommendedGrader": "PSA" | "BGS" | "CGC" | "SGC",
  "recommendedGraderReason": "string",
  "gradingRecommendation": "string",
  "confidence": "high" | "medium" | "low"
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
              { type: "text", text: "Analyze this trading card's condition and provide a detailed grading assessment." },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
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

    let analysis;
    try {
      const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/) || content.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
      analysis = JSON.parse(jsonStr);
    } catch {
      return new Response(
        JSON.stringify({ error: "Failed to parse grading analysis" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, source: "CollectAI", data: analysis }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in collectai-grade:", error);
    return new Response(
      JSON.stringify({ error: "An error occurred during grading analysis" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
