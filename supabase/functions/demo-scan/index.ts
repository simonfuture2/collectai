import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: "AI service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => null);
    const imageBase64: string | undefined = body?.imageBase64;
    const mimeType: string = body?.mimeType || "image/jpeg";

    if (
      !imageBase64 ||
      typeof imageBase64 !== "string" ||
      imageBase64.length < 100 ||
      imageBase64.length > 8_000_000
    ) {
      return new Response(JSON.stringify({ error: "imageBase64 is required (max ~6MB)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!/^image\/(jpeg|jpg|png|webp)$/.test(mimeType)) {
      return new Response(JSON.stringify({ error: "Unsupported image type" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Rate limit by hashed IP (3 / 24h)
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      req.headers.get("cf-connecting-ip") ||
      "unknown";
    const ipHash = await sha256Hex(ip + ":collectai-demo");

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: rl, error: rlErr } = await admin.rpc("consume_demo_scan", {
      _ip_hash: ipHash,
      _max_per_day: 3,
    });
    if (rlErr) {
      console.error("rate limit error", rlErr);
      return new Response(JSON.stringify({ error: "Rate check failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const allowed = rl?.[0]?.allowed ?? false;
    const remaining = rl?.[0]?.remaining ?? 0;
    if (!allowed) {
      return new Response(
        JSON.stringify({
          error: "Daily demo limit reached. Sign up for a free account to keep scanning.",
          rateLimited: true,
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = `You are a trading card expert. From the image, identify the card and estimate its raw (ungraded) market value.

Respond ONLY with valid JSON in this exact shape:
{
  "cardName": "string (e.g. 'Charizard')",
  "cardSet": "string (e.g. 'Base Set')",
  "cardNumber": "string or null (e.g. '4/102')",
  "category": "string (Pokémon | Magic | Yu-Gi-Oh! | Sports | Other)",
  "conditionGrade": "string (e.g. 'NM 7', 'EX 5', 'PSA-ready 9')",
  "gradeNumber": "number 1-10",
  "estimatedValueLow": number,
  "estimatedValueHigh": number,
  "currency": "USD",
  "confidence": "high" | "medium" | "low"
}

If the image is not a trading card, return {"error": "not_a_card"}.`;

    const aiResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mimeType, data: imageBase64 },
              },
              { type: "text", text: "Identify, grade, and value this card." },
            ],
          },
        ],
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error("Anthropic error", aiResp.status, errText);
      return new Response(JSON.stringify({ error: "AI analysis failed" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiResp.json();
    const text: string = aiJson?.content?.[0]?.text ?? "";
    const match = text.match(/```json\n?([\s\S]*?)\n?```/) || text.match(/\{[\s\S]*\}/);
    const jsonStr = match ? (match[1] || match[0]) : text;
    let parsed: any;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      return new Response(JSON.stringify({ error: "Could not parse AI response" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (parsed?.error === "not_a_card") {
      return new Response(
        JSON.stringify({ error: "We couldn't detect a trading card in that image." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, remaining, data: parsed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("demo-scan error", err);
    return new Response(JSON.stringify({ error: "Unexpected error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
