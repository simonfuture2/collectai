import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Simple in-memory rate limiter: 3 scans per IP per hour
const ipMap = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = ipMap.get(ip);
  if (!entry || now > entry.resetAt) {
    ipMap.set(ip, { count: 1, resetAt: now + 3600_000 });
    return false;
  }
  if (entry.count >= 3) return true;
  entry.count++;
  return false;
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

    if (isRateLimited(clientIp)) {
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

    // Limit image size (~5MB base64)
    if (imageBase64.length > 7_000_000) {
      return new Response(
        JSON.stringify({ error: "Image too large. Max 5MB." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const mimeMatch = imageBase64.match(/^data:(image\/\w+);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
            content: `You are a trading card identification and grading AI. Analyze the card image and return ONLY a JSON object with these fields:
- card_name: string (full card name)
- card_set: string (set/series name)  
- card_year: string (year)
- condition_grade: string (e.g. "NM 7", "MT 9", "EX 5")
- estimated_value_low: number (USD)
- estimated_value_high: number (USD)
- confidence: number (0-100)
- category: string (e.g. "Pokémon", "Sports Card", "Yu-Gi-Oh!", "Magic: The Gathering")

Return ONLY valid JSON, no markdown, no explanation.`,
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Identify this trading card, estimate its condition grade, and provide a market value range." },
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${cleanBase64}` } },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "quick_scan_result",
              description: "Return the quick scan result for a trading card.",
              parameters: {
                type: "object",
                properties: {
                  card_name: { type: "string" },
                  card_set: { type: "string" },
                  card_year: { type: "string" },
                  condition_grade: { type: "string" },
                  estimated_value_low: { type: "number" },
                  estimated_value_high: { type: "number" },
                  confidence: { type: "number" },
                  category: { type: "string" },
                },
                required: ["card_name", "card_set", "card_year", "condition_grade", "estimated_value_low", "estimated_value_high", "confidence", "category"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "quick_scan_result" } },
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      const text = await aiResponse.text();
      console.error("AI gateway error:", status, text);

      if (status === 429) {
        return new Response(
          JSON.stringify({ error: "AI service is busy. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (status === 402) {
        return new Response(
          JSON.stringify({ error: "Service temporarily unavailable." }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: "Failed to analyze card" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall?.function?.arguments) {
      console.error("Unexpected AI response:", JSON.stringify(aiData));
      return new Response(
        JSON.stringify({ error: "Could not identify this card. Try a clearer photo." }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("quick-scan error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
