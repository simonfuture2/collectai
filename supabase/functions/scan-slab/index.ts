// scan-slab: read the actual grade/cert off a slab photo, overwrite the card
// with the authoritative slab result, snapshot the pre-grade AI prediction,
// and kick off a graded-tier market refresh in the background.
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function extractJson(text: string): any {
  let s = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first !== -1 && last > first) s = s.slice(first, last + 1);
  return JSON.parse(s);
}

async function extractFromSlab(images: { label: string; url: string }[], LOVABLE_API_KEY: string) {
  const systemPrompt = `You are reading the label of a graded trading card slab. Return ONLY the grade printed on the slab — do NOT guess or estimate. If you cannot read the grade clearly, set confidence low.

Return JSON only:
{
  "grading_company": "PSA" | "BGS" | "CGC" | "SGC" | "TAG" | "AuthentiSeal" | "Other" | null,
  "grade_label": "string as printed on the slab, e.g. 'NM-MT 8' or 'GEM MT 10'" | null,
  "grade_numeric": number | null,
  "cert_number": "string" | null,
  "card_name": "string" | null,
  "card_year": "string" | null,
  "card_set": "string" | null,
  "subgrades": { "centering": number, "corners": number, "edges": number, "surface": number } | null,
  "confidence": number
}`;
  const body = {
    model: "google/gemini-3.5-flash",
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          { type: "text", text: "Read the grade and cert info from this slab label. Return JSON only." },
          ...images.slice(0, 2).map((i) => ({ type: "image_url" as const, image_url: { url: i.url } })),
        ],
      },
    ],
    response_format: { type: "json_object" as const },
  };
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`slab extract failed: ${r.status} ${t.slice(0, 200)}`);
  }
  const data = await r.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("empty slab extract");
  return extractJson(text);
}

function toNum(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function buildAccuracy(pred: any, actualNumeric: number | null, actualCompany: string | null) {
  const predictedGradeRaw =
    toNum(pred?.grade_numeric) ??
    toNum(pred?.preGradingAnalysis?.gradeCeiling?.grade) ??
    toNum(pred?.preGradingAnalysis?.predictedGrades?.psa) ??
    toNum(pred?.preGradingAnalysis?.overallScore);

  const predictedValueLow = toNum(pred?.estimatedValueLow);
  const predictedValueHigh = toNum(pred?.estimatedValueHigh);
  const predictedValueMid =
    predictedValueLow != null && predictedValueHigh != null
      ? (predictedValueLow + predictedValueHigh) / 2
      : null;

  if (predictedGradeRaw == null || actualNumeric == null) {
    return {
      hasComparison: false,
      predictedGrade: predictedGradeRaw,
      actualGrade: actualNumeric,
      actualCompany,
      predictedValueMid,
      verdict: "Snapshot saved — no prior AI grade to compare",
      accuracyScore: null,
    };
  }

  const delta = actualNumeric - predictedGradeRaw;
  const absHalf = Math.abs(delta) / 0.5;
  const accuracyScore = Math.max(0, Math.round(100 - absHalf * 20));

  let verdict: string;
  const absDelta = Math.abs(delta);
  if (absDelta === 0) verdict = "Spot on";
  else if (absDelta <= 0.5) verdict = "Very close";
  else if (absDelta <= 1) verdict = "Off by a grade";
  else verdict = "Way off";

  return {
    hasComparison: true,
    predictedGrade: predictedGradeRaw,
    actualGrade: actualNumeric,
    actualCompany,
    deltaGrades: Math.round(delta * 10) / 10,
    withinHalf: absDelta <= 0.5,
    withinOne: absDelta <= 1,
    accuracyScore,
    verdict,
    predictedValueMid,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) return json(500, { error: "LOVABLE_API_KEY not configured" });

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json(401, { error: "Unauthorized" });

  const supabaseAsUser = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userRes, error: userErr } = await supabaseAsUser.auth.getUser();
  if (userErr || !userRes?.user) return json(401, { error: "Unauthorized" });
  const userId = userRes.user.id;

  let body: any;
  try { body = await req.json(); } catch { return json(400, { error: "Invalid JSON" }); }
  const { cardId, images } = body || {};
  if (!cardId || !Array.isArray(images) || images.length === 0) {
    return json(400, { error: "cardId and images required" });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: card, error: cardErr } = await admin
    .from("cards")
    .select("*")
    .eq("id", cardId)
    .single();
  if (cardErr || !card) return json(404, { error: "Card not found" });
  if (card.user_id !== userId) return json(403, { error: "Forbidden" });

  // Step A — vision extract
  let extracted: any;
  try {
    extracted = await extractFromSlab(images, LOVABLE_API_KEY);
  } catch (e: any) {
    console.error("[scan-slab] extract failed:", e?.message);
    return json(502, { error: "Could not read slab label. Try a clearer, straight-on photo of the label." });
  }

  const confidence = Number(extracted?.confidence ?? 0);
  const numeric = toNum(extracted?.grade_numeric);
  const company = extracted?.grading_company && extracted.grading_company !== "Other" ? String(extracted.grading_company) : null;
  const label = extracted?.grade_label ? String(extracted.grade_label) : (numeric != null && company ? `${company} ${numeric}` : null);

  if (!company || numeric == null || confidence < 0.5) {
    return json(422, {
      error: "Slab grade could not be read confidently. Retake the photo with the entire label visible and in focus.",
      extracted,
    });
  }

  // Step B — snapshot pre-grade prediction (first-scan wins)
  const currentAnalysis = (card.ai_analysis as any) || {};
  const existingSnapshot = currentAnalysis.preGradePrediction;
  const preGradePrediction = existingSnapshot || {
    condition_grade: card.condition_grade ?? null,
    grade_numeric: (card as any).grade_numeric ?? null,
    estimated_value_low: card.estimated_value_low ?? null,
    estimated_value_high: card.estimated_value_high ?? null,
    predictedGrades: currentAnalysis.preGradingAnalysis?.predictedGrades ?? null,
    gradeCeiling: currentAnalysis.preGradingAnalysis?.gradeCeiling ?? null,
    gradingEdge: currentAnalysis.gradingEdge ?? null,
    snapshotted_at: new Date().toISOString(),
  };

  // Step E — accuracy scorecard (based on snapshot vs actual)
  const gradeAccuracy = buildAccuracy(
    existingSnapshot ? { grade_numeric: existingSnapshot.grade_numeric ?? existingSnapshot.gradeCeiling?.grade, preGradingAnalysis: { gradeCeiling: existingSnapshot.gradeCeiling, predictedGrades: existingSnapshot.predictedGrades }, estimatedValueLow: existingSnapshot.estimated_value_low, estimatedValueHigh: existingSnapshot.estimated_value_high } : { grade_numeric: preGradePrediction.grade_numeric, preGradingAnalysis: { gradeCeiling: preGradePrediction.gradeCeiling, predictedGrades: preGradePrediction.predictedGrades }, estimatedValueLow: preGradePrediction.estimated_value_low, estimatedValueHigh: preGradePrediction.estimated_value_high },
    numeric,
    company,
  );

  const nextAnalysis = {
    ...currentAnalysis,
    preGradePrediction,
    gradeAccuracy,
    confirmedGrade: { company, grade_numeric: numeric, label, cert_number: extracted.cert_number ?? null },
  };

  // Step C — persist authoritative fields
  const { error: updateErr } = await admin
    .from("cards")
    .update({
      grading_company: company,
      grading_cert_number: extracted.cert_number || card.grading_cert_number || null,
      grade_numeric: numeric,
      condition_grade: label,
      is_authenticated: true,
      authenticated_at: new Date().toISOString(),
      authentication_data: {
        source: "slab_scan",
        extracted,
        images: images.map((i: any) => ({ label: i.label, url: i.url })),
        scanned_at: new Date().toISOString(),
      },
      ai_analysis: nextAnalysis,
    })
    .eq("id", cardId);
  if (updateErr) {
    console.error("[scan-slab] update failed:", updateErr);
    return json(500, { error: "Failed to save slab data" });
  }

  // Step D — refresh market evidence for the confirmed grade (fire-and-forget)
  try {
    const enrichRes = fetch(`${SUPABASE_URL}/functions/v1/enrich-card`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        cardId,
        images,
        category: card.category || undefined,
        fastScan: false,
        knownGrade: { company, numeric, label, cert_number: extracted.cert_number ?? null },
      }),
    });
    // @ts-ignore
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(enrichRes.catch(() => {}));
    }
  } catch (err) {
    console.error("[scan-slab] enrich kick-off failed:", err);
  }

  return json(200, {
    ok: true,
    extracted,
    accuracy: gradeAccuracy,
    confirmedGrade: { company, numeric, label },
  });
});
