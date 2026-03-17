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

// Helper: search eBay sold listings via Firecrawl for quick scan
async function quickEbaySearch(cardName: string, cardSet: string, cardYear: string): Promise<string> {
  const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
  if (!FIRECRAWL_API_KEY) return "";

  try {
    const query = `${cardName} ${cardSet} ${cardYear} sold site:ebay.com`;
    console.log("Quick scan eBay search:", query);

    const response = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        limit: 5,
        tbs: "qdr:m",
      }),
    });

    if (!response.ok) {
      console.error("Firecrawl quick search error:", response.status);
      return "";
    }

    const data = await response.json();
    const results = (data.data || [])
      .filter((r: any) => r.url?.includes("ebay.com"))
      .slice(0, 5);

    if (results.length === 0) return "";

    const listings = results
      .map((r: any) => `- ${r.title || "Listing"}: ${(r.description || "").substring(0, 200)}`)
      .join("\n");

    return `\n\nREAL eBay sold listings found today:\n${listings}\nUse these prices as your PRIMARY value anchor.`;
  } catch (err) {
    console.error("Quick eBay search failed:", err);
    return "";
  }
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

    // ===== STEP 1: Quick identification =====
    console.log("Quick scan Step 1: Identifying card...");
    const idResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
            content: "Identify this trading card. Return ONLY card_name, card_set, card_year as JSON.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Identify this card." },
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${cleanBase64}` } },
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

    let cardId: { card_name: string; card_set: string; card_year: string } | null = null;
    if (idResponse.ok) {
      const idData = await idResponse.json();
      const toolCall = idData.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        cardId = JSON.parse(toolCall.function.arguments);
        console.log("Card identified:", cardId);
      }
    }

    // ===== STEP 2: Search eBay sold listings =====
    let ebayContext = "";
    if (cardId?.card_name) {
      ebayContext = await quickEbaySearch(cardId.card_name, cardId.card_set || "", cardId.card_year || "");
    }

    // ===== STEP 3: Full quick scan with market data =====
    const today = new Date().toISOString().split("T")[0];

    const systemPrompt = `You are a trading card identification and grading AI. Today's date is ${today}.

CRITICAL PRICING RULES:
${ebayContext ? "You have REAL eBay sold listing data below. Use these actual sold prices as your PRIMARY value estimate. Do NOT use outdated training data when real prices are available." : "You do NOT have real-time market data. Be CONSERVATIVE with value estimates. Provide wider ranges rather than confidently wrong narrow estimates. If unsure, set confidence below 50."}

Analyze the card image and return ONLY a JSON object with these fields:
- card_name: string (full card name)
- card_set: string (set/series name)  
- card_year: string (year)
- condition_grade: string (e.g. "NM 7", "MT 9", "EX 5")
- estimated_value_low: number (USD - ${ebayContext ? "based on real eBay sold data" : "conservative low estimate"})
- estimated_value_high: number (USD - ${ebayContext ? "based on real eBay sold data" : "conservative high estimate"})
- confidence: number (0-100, ${ebayContext ? "higher since real data available" : "keep LOW if unsure about pricing"})
- category: string (e.g. "Pokémon", "Sports Card", "Yu-Gi-Oh!", "Magic: The Gathering")

Return ONLY valid JSON, no markdown, no explanation.`;

    const userText = ebayContext
      ? `Identify this trading card, estimate its condition grade, and provide a market value range based on the real eBay sold data provided.${ebayContext}`
      : "Identify this trading card, estimate its condition grade, and provide a market value range. Be conservative if unsure about current prices.";

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
              { type: "text", text: userText },
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
