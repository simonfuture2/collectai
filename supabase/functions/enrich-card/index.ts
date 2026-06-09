// Background enrichment: runs the shared analysis engine and persists results.
// Invoked server-to-server from identify-card (or from CardDetail "Retry analysis").
// Updates the cards row in place and inserts price_history.
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { runAnalysis } from "../_shared/analysisEngine.ts";
import { buildPriceHistoryRows } from "../_shared/marketData.ts";
import { computePriceTrend } from "../_shared/priceTrend.ts";
import { buildRecommendation } from "../_shared/recommendation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Hard timeout wrapper.
async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return await Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

async function callGeminiVision(
  model: string,
  systemPrompt: string,
  userText: string,
  images: { label: string; url: string }[],
  LOVABLE_API_KEY: string,
  timeoutMs: number,
  maxTokens: number,
  jsonMode = false,
): Promise<string | null> {
  try {
    const body: any = {
      model,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: userText },
            ...images.map((img) => ({
              type: "image_url" as const,
              image_url: { url: img.url },
            })),
          ],
        },
      ],
    };
    if (jsonMode) body.response_format = { type: "json_object" };
    const response = await withTimeout(
      fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }),
      timeoutMs,
      `gemini-${model}`,
    );
    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.error(`[enrich-card] gemini ${model} failed:`, response.status, errText.slice(0, 200));
      return null;
    }
    const data = await response.json();
    return data.choices?.[0]?.message?.content || null;
  } catch (err) {
    console.error(`[enrich-card] gemini ${model} error:`, err);
    return null;
  }
}

function extractJsonObject(text: string): any {
  let jsonStr = text.trim()
    .replace(/^```(?:json|JSON)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .trim();
  const first = jsonStr.indexOf("{");
  const last = jsonStr.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) jsonStr = jsonStr.slice(first, last + 1);
  jsonStr = jsonStr.replace(/,\s*([}\]])/g, "$1");
  return JSON.parse(jsonStr);
}

type IdentifyResult = {
  card_name: string;
  card_number?: string;
  card_set?: string;
  card_year?: string;
  variant?: string;
  rarity?: string;
  category?: string;
};

// Light-weight identification used only as a fast pre-pass so the detail page
// can show the card name immediately. The shared engine re-identifies as part
// of its pipeline.
async function quickIdentify(
  images: { label: string; url: string }[],
  LOVABLE_API_KEY: string,
): Promise<IdentifyResult | null> {
  const systemPrompt = `You are an expert trading card identifier. Read text on the card and return JSON:
{"card_name":"string","card_number":"string","card_set":"string","card_year":"string","variant":"string","rarity":"string","category":"Trading Card | Sports Card | Coin | Comic"}
Respond with ONE valid JSON object only.`;
  const userText = "Identify this collectible. Return JSON only.";
  const imgs = images.slice(0, 2);
  let text = await callGeminiVision("google/gemini-3.5-flash", systemPrompt, userText, imgs, LOVABLE_API_KEY, 20_000, 1024, true);
  if (!text) {
    text = await callGeminiVision("google/gemini-3-flash", systemPrompt, userText, imgs, LOVABLE_API_KEY, 12_000, 1024, true);
  }
  if (!text) return null;
  try {
    const parsed = extractJsonObject(text) as IdentifyResult;
    if (!parsed?.card_name) return null;
    return parsed;
  } catch (err) {
    console.error("[enrich-card] quick identify parse error:", err);
    return null;
  }
}

async function runEnrichment(params: {
  cardId: string;
  userId: string;
  images: { label: string; url: string }[];
  category?: string;
  fastScan: boolean;
  supabaseAdmin: ReturnType<typeof createClient>;
}) {
  const { cardId, userId, images, category, fastScan, supabaseAdmin } = params;

  console.log(`[enrich-card] start card=${cardId} fastScan=${fastScan}`);

  // Stage: pricing — engine handles identification + market + Claude + verification.
  await supabaseAdmin.from("cards").update({ analysis_status: "pricing" }).eq("id", cardId);

  const { analysis, identification, marketData: aggregated } = await runAnalysis({
    images,
    category,
    fastScan,
  });

  if (!identification?.card_name) {
    throw new Error("Could not identify the card. Please try a clearer image.");
  }

  // Persist card row
  const { error: updateError } = await supabaseAdmin
    .from("cards")
    .update({
      category: analysis.category || "Trading Card",
      card_name: identification.card_name || analysis.cardName || null,
      card_set: identification.card_set || analysis.cardSet || null,
      card_year: identification.card_year || analysis.cardYear || null,
      edition: analysis.edition || identification.variant || null,
      rarity: analysis.rarity || identification.rarity || null,
      condition_grade: analysis.conditionGrade || null,
      special_features: analysis.specialFeatures || [],
      estimated_value_low: analysis.estimatedValueLow ?? null,
      estimated_value_high: analysis.estimatedValueHigh ?? null,
      ebay_recent_sales: analysis.ebayRecentSales || null,
      tcgplayer_price: analysis.tcgplayerPrice || null,
      psa_population_data: analysis.psaPopulation || null,
      ai_analysis: analysis,
      last_scanned_at: new Date().toISOString(),
      analysis_status: "complete",
      analysis_error: null,
      analysis_completed_at: new Date().toISOString(),
    })
    .eq("id", cardId);

  if (updateError) throw updateError;

  // Price history
  const priceRows = buildPriceHistoryRows(aggregated, cardId, userId);
  if (priceRows.length > 0) {
    await supabaseAdmin.from("price_history").insert(priceRows);
  }

  // Trend + recommendation (mirror analyze-card)
  try {
    const trend = await computePriceTrend(supabaseAdmin, cardId);
    analysis.priceTrend = trend;
    console.log(
      `[priceTrend] ${trend.status} dir=${trend.direction ?? "-"} 30d=${trend.change30dPct ?? "-"}% 90d=${trend.change90dPct ?? "-"}% n=${trend.sampleSize} src=${trend.source}`,
    );
  } catch (err) {
    console.error("[priceTrend] failed:", (err as Error)?.message);
  }

  try {
    const rec = buildRecommendation({
      trend: analysis.priceTrend ?? null,
      gradingEdge: analysis.gradingEdge ?? null,
      confidenceBand: analysis.confidenceBand ?? null,
    });
    analysis.recommendation = rec;
    console.log(`[recommendation] ${rec.action} — ${rec.rationale}`);
  } catch (err) {
    console.error("[recommendation] failed:", (err as Error)?.message);
  }

  try {
    await supabaseAdmin.from("cards").update({ ai_analysis: analysis }).eq("id", cardId);
  } catch (err) {
    console.error("[persist analysis] failed:", (err as Error)?.message);
  }

  console.log(`[enrich-card] complete card=${cardId}`);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Auth: only accept calls from our own backend using the service role key.
  const authHeader = req.headers.get("Authorization") || "";
  if (authHeader !== `Bearer ${serviceKey}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceKey);

  let body: any;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { cardId, images, category, fastScan } = body || {};
  let identification: IdentifyResult | undefined = body?.identification;

  if (!cardId || !Array.isArray(images) || images.length === 0) {
    return new Response(JSON.stringify({ error: "cardId and images required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Validate card exists
  const { data: card, error: cardErr } = await supabaseAdmin
    .from("cards")
    .select("id, user_id")
    .eq("id", cardId)
    .single();
  if (cardErr || !card) {
    return new Response(JSON.stringify({ error: "Card not found" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const work = (async () => {
    try {
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

      let resolvedCategory = category;

      // Early identification only when the caller didn't pre-identify — populates
      // the detail page name while the shared engine runs (it re-identifies).
      if (!identification?.card_name) {
        await supabaseAdmin.from("cards").update({
          analysis_status: "identifying",
          analysis_started_at: new Date().toISOString(),
          analysis_error: null,
        }).eq("id", cardId);

        const idResult = await quickIdentify(images, LOVABLE_API_KEY);
        if (idResult?.card_name) {
          identification = idResult;
          if (idResult.category) resolvedCategory = idResult.category;
          await supabaseAdmin.from("cards").update({
            card_name: idResult.card_name,
            card_set: idResult.card_set || null,
            card_year: idResult.card_year || null,
            rarity: idResult.rarity || null,
            category: resolvedCategory || "Trading Card",
            analysis_status: "pricing",
          }).eq("id", cardId);
        }
      } else {
        await supabaseAdmin.from("cards").update({
          analysis_status: "pricing",
          analysis_started_at: new Date().toISOString(),
          analysis_error: null,
        }).eq("id", cardId);
      }

      await runEnrichment({
        cardId,
        userId: card.user_id as string,
        images,
        category: resolvedCategory,
        fastScan: fastScan === true,
        supabaseAdmin,
      });
    } catch (err: any) {
      console.error("[enrich-card] failed:", err);
      await supabaseAdmin.from("cards").update({
        analysis_status: "failed",
        analysis_error: String(err?.message || err).slice(0, 500),
        analysis_completed_at: new Date().toISOString(),
      }).eq("id", cardId);
    }
  })();

  // @ts-ignore - EdgeRuntime is available in Deno Deploy
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
    // @ts-ignore
    EdgeRuntime.waitUntil(work);
  } else {
    work.catch(() => {});
  }

  return new Response(JSON.stringify({ status: "started", cardId }), {
    status: 202,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
