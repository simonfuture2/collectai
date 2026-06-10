// Shared analysis engine — single source of truth for the scan pipeline.
//
// Performs (in order):
//   1. Card identification (Gemini)
//   2. Tiered cross-referenced market data (PriceCharting + eBay + TCGPlayer via getMarketData)
//   3. ID↔comp cross-check + variant uncertainty
//   4. Full analysis with Claude (text + image)
//   5. No-market-data guardrails (cap/widen values, force low confidence)
//   6. Dual Claude×Gemini price verification (skipped in fast scan)
//   7. Identification-uncertainty widening
//   8. Grading-arbitrage EV headline (analysis.gradingEdge)
//   9. Data-quality + cross-source confidence score 0–100 (analysis.confidence*)
//
// Pure analysis — no DB writes, no Supabase client. Callers are responsible for
// persistence, credit deduction, duplicate prevention, price_history, trend, and
// recommendation.

import { identifyWithGemini } from "./gemini.ts";
import {
  getMarketData,
  type AggregatedMarketData,
  crossCheckIdentification,
} from "./marketData.ts";
import { computeMarketConfidence } from "./confidence.ts";
import { groundedPreGrade } from "./grading.ts";

// Model used for Step 1 card identification (bake-off winner).
// Change this single constant to swap identification models.
export const IDENTIFY_MODEL = "gemini-3.5-flash";

export interface CardIdentification {
  card_name: string;
  card_number: string;
  card_set: string;
  card_year: string;
  variant: string;
  rarity: string;
  variant_confidence?: "high" | "medium" | "low";
}

export interface RunAnalysisInput {
  images: { label: string; url: string }[];
  category?: string;
  fastScan?: boolean;
}

export interface RunAnalysisResult {
  analysis: any;
  identification: CardIdentification | null;
  marketData: AggregatedMarketData;
  hasBackImage: boolean;
}

// ---------- helpers ----------

function safeFixed(val: unknown, digits = 2): string {
  const num = typeof val === "number" ? val : Number(val);
  return isNaN(num) ? "0" : num.toFixed(digits);
}

// Claude verification of pricing
async function verifyWithClaude(
  cardId: CardIdentification,
  analysis: any,
  marketSummary: string,
  ANTHROPIC_API_KEY: string,
): Promise<{ verifiedLow: number; verifiedHigh: number; verificationNote: string } | null> {
  try {
    console.log("Running Claude price verification...");
    const prompt = `You are a trading card price verification expert. Verify this estimate against the real market data.

Card: ${cardId.card_name} ${cardId.card_number || ""} ${cardId.variant || ""} (${cardId.card_set || ""} ${cardId.card_year || ""})
Condition: ${analysis.conditionGrade || "Unknown"}

AI estimated value: $${safeFixed(analysis.estimatedValueLow)} - $${safeFixed(analysis.estimatedValueHigh)}

${marketSummary}

TASK: Based ONLY on the real market data above, determine the correct value range for this card.
- If the AI estimate is wildly wrong (e.g., $5-50 when data shows $100+), CORRECT IT.
- Your verified_low should be approximately the blended value × 0.85
- Your verified_high should be approximately the blended value × 1.15
- Adjust based on condition relative to what's described in listings.

Return ONLY valid JSON:
{"verified_low": number, "verified_high": number, "verification_note": "brief explanation"}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 2048,
        thinking: { type: "enabled", budget_tokens: 1024 },
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      console.error("Claude verification failed:", response.status);
      return null;
    }

    const data = await response.json();
    const textBlock = (data.content || []).find((b: any) => b?.type === "text");
    const text = textBlock?.text || data.content?.[0]?.text;
    if (!text) return null;

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const result = JSON.parse(jsonMatch[0]);
    return {
      verifiedLow: result.verified_low,
      verifiedHigh: result.verified_high,
      verificationNote: result.verification_note,
    };
  } catch (err) {
    console.error("Claude verification error:", err);
    return null;
  }
}

// Gemini 2.5 Pro verification of pricing (cross-reference for Claude)
async function verifyWithGemini(
  cardId: CardIdentification,
  analysis: any,
  marketSummary: string,
  LOVABLE_API_KEY: string,
): Promise<{ verifiedLow: number; verifiedHigh: number; verificationNote: string } | null> {
  try {
    console.log("Running Gemini 2.5 Pro price cross-verification...");
    const prompt = `You are a trading card price verification expert. Verify this estimate against the real market data.

Card: ${cardId.card_name} ${cardId.card_number || ""} ${cardId.variant || ""} (${cardId.card_set || ""} ${cardId.card_year || ""})
Condition: ${analysis.conditionGrade || "Unknown"}

AI estimated value: $${safeFixed(analysis.estimatedValueLow)} - $${safeFixed(analysis.estimatedValueHigh)}

${marketSummary}

TASK: Based ONLY on the real market data above, determine the correct value range for this card.
- If the AI estimate is wildly wrong, CORRECT IT.
- verified_low ≈ blended value × 0.85, verified_high ≈ blended value × 1.15.
- Adjust based on condition relative to listings.

Return ONLY valid JSON: {"verified_low": number, "verified_high": number, "verification_note": "brief explanation"}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      console.error("Gemini verification failed:", response.status, await response.text().catch(() => ""));
      return null;
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) return null;

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const result = JSON.parse(jsonMatch[0]);
    if (typeof result.verified_low !== "number" || typeof result.verified_high !== "number") return null;
    return {
      verifiedLow: result.verified_low,
      verifiedHigh: result.verified_high,
      verificationNote: result.verification_note || "",
    };
  } catch (err) {
    console.error("Gemini verification error:", err);
    return null;
  }
}

// ---------- main entry ----------

export async function runAnalysis(input: RunAnalysisInput): Promise<RunAnalysisResult> {
  const { images, category, fastScan = false } = input;
  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");

  const hasBackImage = images.some((i) => /back/i.test(i.label));

  // ===== STEP 1: Detailed identification with Gemini =====
  console.log(`Step 1: Identifying card with ${IDENTIFY_MODEL}...`);
  const t0 = Date.now();
  const cardId = (await identifyWithGemini(images[0].url, IDENTIFY_MODEL)) as CardIdentification | null;
  console.log(`Card identified by ${IDENTIFY_MODEL} in ${Date.now() - t0}ms:`, JSON.stringify(cardId));

  // ===== STEP 2: Tiered cross-referenced market data =====
  let aggregated: AggregatedMarketData = {
    sources: [], blended: null, crossReference: {}, summary: "", hasData: false, compTitles: [],
  };
  if (cardId?.card_name) {
    console.log("Step 2: Aggregating market data from PriceCharting + Firecrawl comps...");
    aggregated = await getMarketData(cardId, category, fastScan);
    console.log(
      "Market data found:",
      aggregated.hasData ? "Yes" : "No",
      "| sources:",
      aggregated.sources.map((s) => s.source).join(","),
    );
  }

  // ===== ID ↔ comp cross-check + variant uncertainty =====
  const idCheck = cardId
    ? crossCheckIdentification(cardId, aggregated.compTitles)
    : { matchPct: 0, identificationUncertain: false, matchedCount: 0, total: 0 };
  const variantConfidence = cardId?.variant_confidence || "medium";
  const variantUncertain = variantConfidence !== "high";
  const identificationUncertain = idCheck.identificationUncertain || variantUncertain;
  if (cardId) {
    console.log(
      `[id-check] comp match ${idCheck.matchedCount}/${idCheck.total} (${idCheck.matchPct}%), variant_confidence=${variantConfidence}, identificationUncertain=${identificationUncertain}`,
    );
  }

  // Backward-compat shape consumed by the rest of this function.
  const marketData = {
    summary: aggregated.summary,
    hasData: aggregated.hasData,
    extractedMarketData: {
      sources: aggregated.sources,
      blended: aggregated.blended,
      crossReference: aggregated.crossReference,
    },
  };

  // ===== STEP 3: Full analysis with Claude =====
  const today = new Date().toISOString().split("T")[0];

  const systemPrompt = `You are an expert trading card analyst, appraiser, and professional grader. Today's date is ${today}.

CRITICAL PRICING INSTRUCTIONS:
${marketData.hasData ? `You are provided with REAL recent market price data from eBay (sold + active listings) AND TCGPlayer with extracted dollar amounts below.

VALUATION FORMULA (you MUST follow this):
1. Look at the eBay SOLD listing prices — these are your primary anchor (50% weight).
2. Look at the TCGPlayer prices — these are your secondary anchor (30% weight).
3. Look at the eBay ACTIVE listing prices — these supplement your estimate (20% weight).
4. Compute a weighted average from available sources (normalize weights to sources found).
5. Adjust this value ±15% based on the specific card's condition relative to what's described in the listings.
6. Set estimatedValueLow = adjusted value × 0.85, estimatedValueHigh = adjusted value × 1.15.
7. If market data clearly shows cards selling for $100+, your estimate MUST reflect that — NOT $5-15.
8. Compare the card's condition to what the listings describe. Better condition → estimate toward high end. Worse → low end.

Your estimates MUST be anchored to the real price data. Do NOT override real market data with training knowledge.` : `You do NOT have access to real-time market data. Your training data may contain OUTDATED prices.

CRITICAL NO-MARKET-DATA RULES:
1. If you cannot confidently identify the exact card variant, ASSUME it is a common/base version.
2. For sports cards without market data, estimate conservatively — most raw base cards are worth $1-$20 unless they are rookies, autos, or numbered parallels.
3. NEVER estimate above $100 without market data unless the card is clearly a rare insert, autograph, or serial-numbered parallel that you can specifically identify.
4. Set confidence to "low" and clearly state that values are rough estimates without live market verification.
5. Use a WIDE value range (±50%) to communicate uncertainty.
6. For any card you estimate above $50 without market data, you MUST explain exactly why in confidenceReason (e.g., "rookie card", "autograph", "numbered /25").`}

When shown an image of a trading card, you will:

1. IDENTIFY the card completely:
   - Card name, card number, set/series, year, edition, rarity, variant/parallel type

2. PERFORM DETAILED PRE-GRADING ANALYSIS:
   a) CENTERING (1-10): left/right and top/bottom percentages
   b) CORNERS (1-10): examine all four corners
   c) EDGES (1-10): chipping, whitening, roughness
   d) SURFACE (1-10): scratches, scuffs, holo condition
   e) OVERALL GRADE PREDICTION: PSA, BGS, CGC, SGC
   f) DEFECT MAP: list each visible flaw with normalized image coordinates (x,y both between 0 and 1, where 0,0 is the top-left of the card and 1,1 is the bottom-right). Mark which side the flaw is on. Limit to the 6 most important flaws. If the card is pristine, return an empty defects array.

3. IDENTIFY special features

4. PROVIDE MARKET RESEARCH:
   ${marketData.hasData ? "Use the REAL market price data provided. The extracted prices and computed medians are your valuation anchors." : "Provide your best estimate but flag confidence as low if uncertain."}

5. PRICE FACTORS

6. GRADED VALUE ESTIMATES

Respond with ONLY valid JSON (no markdown code fences) with this structure:
{
  "category": "string",
  "cardName": "string",
  "cardSet": "string", 
  "cardYear": "string",
  "edition": "string",
  "rarity": "string",
  "cardNumber": "string or null",
  "parallelVariant": "string or null",
  "conditionGrade": "string",
  "conditionNotes": "string",
  "preGradingAnalysis": {
    "centering": { "score": number, "frontLeftRight": "string", "frontTopBottom": "string", "backLeftRight": "string", "backTopBottom": "string", "notes": "string", "psa10Eligible": boolean },
    "corners": { "score": number, "topLeft": "string", "topRight": "string", "bottomLeft": "string", "bottomRight": "string", "notes": "string" },
    "edges": { "score": number, "top": "string", "bottom": "string", "left": "string", "right": "string", "notes": "string" },
    "surface": { "score": number, "front": "string", "back": "string", "holoCondition": "string or null", "notes": "string" },
    "overallScore": number,
    "predictedGrades": { "psa": number, "bgs": number, "cgc": number, "sgc": number },
    "bgsSubgrades": { "centering": number, "corners": number, "edges": number, "surface": number },
    "gradeCeiling": {
      "grade": number,
      "service": "PSA" | "BGS" | "CGC" | "SGC",
      "limitingSubscore": "centering" | "corners" | "edges" | "surface",
      "reason": "string — explain WHY this subscore caps the grade (e.g. 'off-center 60/40 caps this at PSA 9')",
      "relatedDefectIndexes": [0]
    },
    "gradingRecommendation": "string"
  },
  "defects": [
    { "type": "corner_wear" | "edge_ding" | "scratch" | "print_line" | "whitening" | "centering_offset" | "crease" | "stain", "side": "front" | "back", "x": number, "y": number, "severity": "minor" | "moderate" | "severe", "note": "string" }
  ],
  "specialFeatures": ["array"],
  "estimatedValueLow": number,
  "estimatedValueHigh": number,
  "valueCurrency": "USD",
  "ebayRecentSales": { "description": "string", "averagePrice": number, "lowPrice": number, "highPrice": number, "recentSalesCount": "string", "notableSales": ["array"] },
  "tcgplayerPrice": { "marketPrice": number, "lowPrice": number, "midPrice": number, "highPrice": number, "description": "string" },
  "psaPopulation": { "description": "string", "estimatedPopulation": "string", "gradedPremium": "string", "recentGradedSales": ["array"] },
  "gradedValueEstimates": {
    "currentGradeEstimate": "string",
    "worthGrading": boolean,
    "worthGradingReason": "string",
    "recommendedGrader": "PSA" | "BGS" | "CGC" | "SGC" | "TAG",
    "recommendedGraderReason": "string",
    "psa": { "estimatedGrade": number, "valueAtGrade": number, "valueAtPSA10": number, "valueAtPSA9": number, "valueAtPSA8": number, "gradingCost": number, "turnaroundTime": "string" },
    "bgs": { "estimatedGrade": number, "valueAtGrade": number, "valueAtBGS10": number, "valueAtBGS9_5": number, "valueAtBGS9": number, "gradingCost": number, "turnaroundTime": "string", "blackLabelPotential": "string" },
    "cgc": { "estimatedGrade": number, "valueAtGrade": number, "valueAtCGC10": number, "valueAtCGC9_5": number, "valueAtCGC9": number, "gradingCost": number, "turnaroundTime": "string" },
    "sgc": { "estimatedGrade": number, "valueAtGrade": number, "valueAtSGC10": number, "valueAtSGC9_5": number, "valueAtSGC9": number, "gradingCost": number, "turnaroundTime": "string" },
    "tag": { "estimatedGrade": number, "valueAtGrade": number, "valueAtTAG10": number, "valueAtTAG9_5": number, "valueAtTAG9": number, "gradingCost": number, "turnaroundTime": "string" }
  },
  "priceFactors": ["array"],
  "valueTrend": "rising" | "stable" | "falling" | "unknown",
  "trendReason": "string",
  "confidence": "high" | "medium" | "low",
  "confidenceReason": "string",
  "investmentOutlook": "string",
  "additionalNotes": "string",
  "dataSource": "string"
}

GRADER COVERAGE RULES (MANDATORY):
- TCG cards (Pokémon, Magic, Yu-Gi-Oh, Dragon Ball, One Piece, etc.): populate psa, cgc, bgs, tag. Set sgc to null.
- Sports cards: populate psa, cgc, bgs, sgc. Set tag to null.
- Other categories: populate psa, cgc, bgs at minimum; others may be null.
- Never return only psa. When you lack direct sales for a grader, estimate from the PSA anchor (BGS ~PSA, CGC ~0.85-0.9x PSA, SGC ~0.9x PSA for sports, TAG ~0.8x PSA for TCG) and lower confidence accordingly.

GRADE-CEILING RULE (MANDATORY):
- You MUST populate preGradingAnalysis.gradeCeiling for every card.
- Pick the LOWEST of centering / corners / edges / surface — that subscore IS the limiting subscore.
- The gradeCeiling.grade must reflect that subscore (e.g. centering 7 → caps at PSA 9; corners 6 → caps at PSA 8).
- gradeCeiling.reason MUST cite the concrete observation (e.g. "off-center 60/40 front", "soft top-right corner", "diagonal scratch through holo") AND reference the defect indexes in 'defects' that drive it via relatedDefectIndexes.
- If the card is pristine across all four subscores (all ≥9.5), set grade=10 and reason="no limiting flaws detected".`;

  const userMessage = images.length > 1
    ? `I'm providing ${images.length} images of this collectible item (${images.map((i) => i.label).join(", ")}). Please analyze all views together for a comprehensive identification, condition assessment, and value estimate.`
    : "Please analyze this trading card image and provide a complete identification, condition assessment, and value estimate.";

  const fullUserMessage = userMessage + marketData.summary;

  console.log("Step 3: Full analysis with Claude,", marketData.hasData ? "real market data" : "AI-only estimates");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 8192,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: fullUserMessage },
            ...images.map((img) => ({
              type: "image" as const,
              source: { type: "url" as const, url: img.url },
            })),
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Claude API error:", response.status, errorText);
    throw new Error(`Claude API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.content?.[0]?.text;
  if (!content) throw new Error("No response from AI");

  console.log("AI response received");

  let analysis: any;
  try {
    const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/) || content.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
    analysis = JSON.parse(jsonStr);
  } catch (parseError) {
    console.error("Failed to parse AI response as JSON:", parseError);
    analysis = {
      cardName: cardId?.card_name || "Unable to identify",
      cardSet: cardId?.card_set || "Unknown",
      cardYear: cardId?.card_year || "Unknown",
      edition: cardId?.variant || "Unknown",
      rarity: cardId?.rarity || "Unknown",
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
      dataSource: "Low-confidence fallback (AI response unparseable)",
      softWarning: "Limited data — this is a best-effort estimate. Re-scan with a clearer photo of the front and back for a tighter range.",
    };
  }

  if (!analysis.dataSource) {
    analysis.dataSource = marketData.hasData
      ? "Real eBay + TCGPlayer data + AI analysis"
      : "AI estimate only - no live market data available";
  }

  // ===== NO-MARKET-DATA GUARDRAILS =====
  if (!marketData.hasData) {
    analysis.confidence = "low";
    analysis.noMarketData = true;
    analysis.confidenceReason = (analysis.confidenceReason || "") +
      " No real-time market data was found — values are AI estimates only and may be significantly inaccurate.";
    if (!analysis.softWarning) {
      analysis.softWarning = "Limited market data — this is a best-effort estimate. Re-scan with a clearer photo of the front and back for a tighter range.";
    }

    const highVal = Number(analysis.estimatedValueHigh) || 0;
    const lowVal = Number(analysis.estimatedValueLow) || 0;

    if (highVal > 100) {
      const hasHighValueTraits = /auto(graph)?|numbered|\/\d{1,3}$|1st edition|rookie|rc|parallel|refractor|prismatic/i.test(
        `${analysis.rarity || ""} ${analysis.parallelVariant || ""} ${analysis.specialFeatures?.join(" ") || ""} ${analysis.edition || ""}`,
      );

      if (!hasHighValueTraits) {
        analysis.estimatedValueHigh = Math.min(highVal, 100);
        analysis.estimatedValueLow = Math.min(lowVal, analysis.estimatedValueHigh * 0.5);
        analysis.valuationWarning = "High value estimated without market verification — capped at conservative estimate. Re-scan to check for updated pricing.";
        console.log(`Capped AI-only estimate from $${lowVal}-$${highVal} to $${analysis.estimatedValueLow}-$${analysis.estimatedValueHigh}`);
      } else {
        analysis.estimatedValueLow = Math.round(lowVal * 0.5);
        analysis.estimatedValueHigh = Math.round(highVal * 1.5);
        analysis.valuationWarning = "High value estimated without market verification — treat as rough estimate. Re-scan to check for updated pricing.";
      }
    } else {
      analysis.estimatedValueLow = Math.round(lowVal * 0.5);
      analysis.estimatedValueHigh = Math.round(highVal * 1.5);
    }
  }

  // ===== STEP 4: Dual price verification (Claude + Gemini in parallel) — skipped in Fast Scan =====
  if (!fastScan && marketData.hasData && analysis.estimatedValueLow != null && cardId) {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    const [claudeVerification, geminiVerification] = await Promise.all([
      verifyWithClaude(cardId, analysis, marketData.summary, ANTHROPIC_API_KEY),
      LOVABLE_API_KEY
        ? verifyWithGemini(cardId, analysis, marketData.summary, LOVABLE_API_KEY)
        : Promise.resolve(null),
    ]);

    const origLow = analysis.estimatedValueLow;
    const origHigh = analysis.estimatedValueHigh;

    if (claudeVerification && geminiVerification) {
      const reconciledLow = (claudeVerification.verifiedLow + geminiVerification.verifiedLow) / 2;
      const reconciledHigh = (claudeVerification.verifiedHigh + geminiVerification.verifiedHigh) / 2;

      const claudeMid = (claudeVerification.verifiedLow + claudeVerification.verifiedHigh) / 2;
      const geminiMid = (geminiVerification.verifiedLow + geminiVerification.verifiedHigh) / 2;
      const disagreementPct = Math.abs(claudeMid - geminiMid) / Math.max(claudeMid, geminiMid, 1);
      const agree = disagreementPct < 0.25;

      analysis.estimatedValueLow = Math.round(reconciledLow * 100) / 100;
      analysis.estimatedValueHigh = Math.round(reconciledHigh * 100) / 100;
      analysis.verificationNote = `Claude: $${safeFixed(claudeVerification.verifiedLow)}-$${safeFixed(claudeVerification.verifiedHigh)}. Gemini: $${safeFixed(geminiVerification.verifiedLow)}-$${safeFixed(geminiVerification.verifiedHigh)}. ${agree ? "Models agree (sanity check ✓)." : `Models disagree by ${(disagreementPct * 100).toFixed(0)}% — using blended midpoint and reducing confidence.`} ${claudeVerification.verificationNote}`;
      analysis.crossVerified = true;
      analysis.modelsAgree = agree;
      analysis.verifierDisagreementPct = Math.round(disagreementPct * 100);
      analysis.dataSource = `Real eBay + TCGPlayer data + Claude × Gemini cross-verified ${agree ? "✓✓" : "(disagreement flagged)"}`;
      console.log(`Cross-verified: Claude $${claudeVerification.verifiedLow}-$${claudeVerification.verifiedHigh}, Gemini $${geminiVerification.verifiedLow}-$${geminiVerification.verifiedHigh}, agree=${agree}`);
    } else if (claudeVerification) {
      analysis.estimatedValueLow = claudeVerification.verifiedLow;
      analysis.estimatedValueHigh = claudeVerification.verifiedHigh;
      analysis.verificationNote = claudeVerification.verificationNote;
      analysis.dataSource = (origLow !== claudeVerification.verifiedLow || origHigh !== claudeVerification.verifiedHigh)
        ? `Real eBay + TCGPlayer data + Claude-verified (corrected from $${safeFixed(origLow)}-$${safeFixed(origHigh)})`
        : "Real eBay + TCGPlayer data + Claude-verified ✓";
      console.log(`Claude-only verified: $${origLow}-$${origHigh} → $${claudeVerification.verifiedLow}-$${claudeVerification.verifiedHigh}`);
    } else if (geminiVerification) {
      analysis.estimatedValueLow = geminiVerification.verifiedLow;
      analysis.estimatedValueHigh = geminiVerification.verifiedHigh;
      analysis.verificationNote = geminiVerification.verificationNote;
      analysis.dataSource = "Real eBay + TCGPlayer data + Gemini-verified ✓";
    }
  }

  // ===== STEP 4.5: Apply identification-uncertainty widening + user-facing notes =====
  {
    const notes: string[] = [];
    let widenFactor = 1;
    if (variantUncertain) {
      widenFactor = variantConfidence === "low" ? 1.5 : 1.25;
      notes.push(
        variantConfidence === "low"
          ? "Variant could not be confidently identified — please confirm the variant/parallel from the card."
          : "Variant identification is uncertain — please confirm the variant/parallel from the card.",
      );
    }
    if (idCheck.identificationUncertain) {
      widenFactor = Math.max(widenFactor, 1.4);
      notes.push(
        `eBay comp titles largely don't match the identified card (${idCheck.matchedCount}/${idCheck.total} matched, ${idCheck.matchPct}%). Treat the value range as a rough estimate and re-scan with a clearer photo.`,
      );
    }
    if (widenFactor > 1 && analysis.estimatedValueLow != null && analysis.estimatedValueHigh != null) {
      const lo = Number(analysis.estimatedValueLow) || 0;
      const hi = Number(analysis.estimatedValueHigh) || 0;
      const mid = (lo + hi) / 2;
      analysis.estimatedValueLow = Math.round(Math.max(0, mid - (mid - lo) * widenFactor) * 100) / 100;
      analysis.estimatedValueHigh = Math.round((mid + (hi - mid) * widenFactor) * 100) / 100;
    }
    analysis.identificationUncertain = identificationUncertain;
    analysis.variantConfidence = variantConfidence;
    analysis.idCompMatchPct = idCheck.matchPct;
    if (notes.length > 0) {
      analysis.confidenceReason = `${analysis.confidenceReason || ""} ${notes.join(" ")}`.trim();
      analysis.identificationNote = notes.join(" ");
      if (analysis.confidence === "high") analysis.confidence = "medium";
    }
  }

  // ===== STEP 4.6: Grading-arbitrage EV headline =====
  {
    try {
      const ebaySoldSrc = aggregated.sources.find((s) => s.source === "ebay_sold");
      const rawValue =
        (ebaySoldSrc?.median && ebaySoldSrc.median > 0 ? ebaySoldSrc.median : null) ??
          aggregated.crossReference.priceChartingValue ??
          aggregated.blended?.median ??
          ((Number(analysis.estimatedValueLow) + Number(analysis.estimatedValueHigh)) / 2 || 0);

      const pg = analysis.preGradingAnalysis || {};
      const gve = analysis.gradedValueEstimates || {};
      const service: "PSA" | "BGS" | "CGC" | "SGC" | "TAG" =
        (gve.recommendedGrader as any) || "PSA";
      const tier = (gve[service.toLowerCase() as keyof typeof gve] as any) || gve.psa || {};

      const predicted = pg.predictedGrades || {};
      const ceiling = pg.gradeCeiling || {};
      const mostLikelyGrade: number =
        Number(ceiling.grade) ||
        Number(predicted[service.toLowerCase()]) ||
        Number(tier.estimatedGrade) ||
        9;
      const nextGrade = Math.min(10, Math.round(mostLikelyGrade) + 1);

      const pcg = aggregated.priceChartingGraded || {};
      const pcAt = (g: number): number | undefined => {
        if (service !== "PSA") return undefined;
        if (g >= 10) return pcg.psa10;
        if (g >= 9) return pcg.psa9;
        if (g >= 8) return pcg.psa8;
        if (g >= 7) return pcg.psa7;
        return undefined;
      };

      const gveAt = (g: number): number | undefined => {
        const key10 = `valueAt${service}10`;
        const key95 = `valueAt${service}9_5`;
        const key9 = `valueAt${service}9`;
        const key8 = `valueAt${service}8`;
        if (g >= 10) return Number(tier[key10]) || Number(tier.valueAtGrade) || undefined;
        if (g >= 9.5) return Number(tier[key95]) || undefined;
        if (g >= 9) return Number(tier[key9]) || Number(tier.valueAtGrade) || undefined;
        if (g >= 8) return Number(tier[key8]) || undefined;
        return Number(tier.valueAtGrade) || undefined;
      };

      const valueAtMostLikely = pcAt(mostLikelyGrade) ?? gveAt(mostLikelyGrade) ?? Number(tier.valueAtGrade) ?? 0;
      const valueAtNextGrade = pcAt(nextGrade) ?? gveAt(nextGrade) ?? 0;

      const gradingCost = Number(tier.gradingCost) || 25;
      const turnaroundTime = String(tier.turnaroundTime || "unknown");

      const evMostLikely = (valueAtMostLikely || 0) - gradingCost - (rawValue || 0);
      const evNextGrade = (valueAtNextGrade || 0) - gradingCost - (rawValue || 0);

      let verdict: "worth_it" | "borderline" | "not_worth_it";
      let verdictReason: string;
      if (!valueAtMostLikely || !rawValue) {
        verdict = "not_worth_it";
        verdictReason = "Insufficient graded-price data to compute a reliable grading edge.";
      } else if (evMostLikely >= Math.max(25, rawValue * 0.4)) {
        verdict = "worth_it";
        verdictReason = `Net edge after $${gradingCost} grading ≈ $${evMostLikely.toFixed(2)} at ${service} ${mostLikelyGrade}. Strong upside vs raw $${rawValue.toFixed(2)}.`;
      } else if (evMostLikely > 0 || evNextGrade >= Math.max(40, rawValue * 0.6)) {
        verdict = "borderline";
        verdictReason = `Marginal at ${service} ${mostLikelyGrade} (net $${evMostLikely.toFixed(2)}), but ${service} ${nextGrade} would pay $${(valueAtNextGrade - gradingCost - rawValue).toFixed(2)}. Grade ceiling: ${ceiling.reason || "see pre-grading analysis"}.`;
      } else {
        verdict = "not_worth_it";
        verdictReason = `Net edge after grading is $${evMostLikely.toFixed(2)} — keep raw. Limiting factor: ${ceiling.reason || "condition not strong enough"}.`;
      }

      analysis.gradingEdge = {
        service,
        rawValue: Math.round(rawValue * 100) / 100,
        mostLikelyGrade,
        valueAtMostLikely: Math.round((valueAtMostLikely || 0) * 100) / 100,
        nextGrade,
        valueAtNextGrade: Math.round((valueAtNextGrade || 0) * 100) / 100,
        gradingCost,
        turnaroundTime,
        netEvAtMostLikely: Math.round(evMostLikely * 100) / 100,
        netEvAtNextGrade: Math.round(evNextGrade * 100) / 100,
        verdict,
        verdictReason,
        gradeCeiling: ceiling.grade
          ? {
              grade: ceiling.grade,
              service: ceiling.service || service,
              limitingSubscore: ceiling.limitingSubscore || null,
              reason: ceiling.reason || null,
              relatedDefectIndexes: ceiling.relatedDefectIndexes || [],
            }
          : null,
        gradedAnchorSource: pcAt(mostLikelyGrade) !== undefined ? "pricecharting" : "ai_estimate",
      };

      console.log(
        `[gradingEdge] service=${service} raw=$${rawValue.toFixed(2)} | ${service} ${mostLikelyGrade}=$${(valueAtMostLikely || 0).toFixed(2)} (net $${evMostLikely.toFixed(2)}) → ${verdict}`,
      );
    } catch (err) {
      console.error("[gradingEdge] computation failed:", (err as Error)?.message);
    }
  }

  // ===== STEP 4.7: Data-quality + cross-source confidence score (0–100) =====
  {
    const conf = computeMarketConfidence(aggregated, {
      verifierDisagreementPct: Number(analysis.verifierDisagreementPct || 0),
      identificationUncertain,
      variantConfidence,
    });

    analysis.confidence = conf.band;
    analysis.confidenceScore = conf.score;
    analysis.confidenceBand = conf.band;
    analysis.confidenceExplanation = conf.explanation;
    analysis.confidenceReason = `${conf.explanation}${analysis.confidenceReason ? " " + analysis.confidenceReason : ""}`.trim();

    console.log(`[confidence] score=${conf.score} band=${conf.band} | ${conf.explanation}`);
  }

  // ===== STEP 4.8: Deterministic pre-grade (lowest dimension caps the band) =====
  if (analysis.preGradingAnalysis) {
    const pgScores = {
      centering: analysis.preGradingAnalysis.centering?.score,
      corners: analysis.preGradingAnalysis.corners?.score,
      edges: analysis.preGradingAnalysis.edges?.score,
      surface: analysis.preGradingAnalysis.surface?.score,
    };
    const grounded = groundedPreGrade(pgScores);
    if (grounded) {
      analysis.preGradingAnalysis.preGrade = grounded;
      if (
        typeof analysis.preGradingAnalysis.overallScore === "number" &&
        analysis.preGradingAnalysis.overallScore > grounded.high
      ) {
        analysis.preGradingAnalysis.overallScore = grounded.high;
      }
    }
  }

  analysis.hasBackImage = hasBackImage;

  return {
    analysis,
    identification: cardId,
    marketData: aggregated,
    hasBackImage,
  };
}
