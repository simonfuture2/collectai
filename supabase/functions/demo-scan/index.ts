import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getMarketData } from "../_shared/marketData.ts";

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

  let consumedHash: string | null = null;
  let adminClient: any = null;
  const refund = async () => {
    if (!consumedHash || !adminClient) return;
    const h = consumedHash;
    consumedHash = null;
    const { error } = await adminClient.rpc("refund_demo_scan", { _ip_hash: h });
    if (error) console.error("refund_demo_scan error", error);
    else console.log("[demo-scan] refunded scan after failure");
  };

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
    adminClient = admin;

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

    consumedHash = ipHash;
    // Global daily budget — caps total public spend across all IPs,
    // since per-IP limit keys on a spoofable x-forwarded-for header.
    const DEMO_DAILY_BUDGET = Number(Deno.env.get("DEMO_SCAN_DAILY_BUDGET") ?? "300");
    const { data: budgetRows, error: budgetErr } = await admin.rpc("consume_daily_budget", {
      _bucket_key: "demo_scan",
      _max_per_day: DEMO_DAILY_BUDGET,
    });
    if (budgetErr) {
      console.error("daily budget error", budgetErr);
      await refund();
      return new Response(JSON.stringify({ error: "Budget check failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const budgetRow = Array.isArray(budgetRows) ? budgetRows[0] : budgetRows;
    if (!budgetRow?.allowed) {
      console.warn(`[demo-scan] daily budget exhausted (used=${budgetRow?.used})`);
      consumedHash = null;
      return new Response(
        JSON.stringify({
          error: "Today's free demo budget is used up. Sign up for a free account to keep scanning.",
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
  "cardYear": "string or null (e.g. '1999')",
  "variant": "string or null (e.g. 'Holo', '1st Edition')",
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
        model: "claude-sonnet-5-5",
        max_tokens: 4000,
        output_config: { effort: "low" },
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
      await refund();
      return new Response(JSON.stringify({ error: "AI analysis failed" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiResp.json();
    if (aiJson?.stop_reason === "max_tokens") console.error("[demo-scan] Claude stopped at max_tokens");
    const textBlock = Array.isArray(aiJson?.content)
      ? aiJson.content.find((b: any) => b?.type === "text")
      : null;
    const text: string = textBlock?.text ?? "";
    const match = text.match(/```json\n?([\s\S]*?)\n?```/) || text.match(/\{[\s\S]*\}/);
    const jsonStr = match ? (match[1] || match[0]) : text;
    let parsed: any;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      console.error("[demo-scan] parse failure", text.slice(0, 300));
      await refund();
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

    // Price from real market data (fast mode, 6s cap)
    parsed.pricedFrom = "estimate";
    try {
      const md: any = await Promise.race([
        getMarketData(
          {
            card_name: String(parsed.cardName ?? ""),
            card_set: parsed.cardSet ?? undefined,
            card_year: parsed.cardYear ? String(parsed.cardYear) : undefined,
            card_number: parsed.cardNumber ?? undefined,
            variant: parsed.variant ?? undefined,
          },
          parsed.category,
          true,
        ),
        new Promise((resolve) => setTimeout(() => resolve(null), 6000)),
      ]);
      const median = md?.blended?.median;
      if (typeof median === "number" && median > 0) {
        parsed.estimatedValueLow = Math.round(median * 0.85);
        parsed.estimatedValueHigh = Math.round(median * 1.15);
        parsed.pricedFrom = "market";
      } else if (md === null) {
        console.warn("[demo-scan] market lookup timed out");
      }
    } catch (e) {
      console.error("[demo-scan] market lookup failed", e);
    }
    console.log(`[demo-scan] ok card=${parsed.cardName} pricedFrom=${parsed.pricedFrom}`);
    consumedHash = null;

    return new Response(
      JSON.stringify({ success: true, remaining, data: parsed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("demo-scan error", err);
    await refund();
    return new Response(JSON.stringify({ error: "Unexpected error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
