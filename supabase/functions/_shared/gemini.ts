// Shared helper: call Google's Generative Language API directly to identify a trading card.
// Returns the canonical CardIdentification shape used elsewhere in the project, or null on failure.

export type VariantConfidence = "high" | "medium" | "low";

export type CardIdentification = {
  card_name: string;
  card_number: string;
  card_set: string;
  card_year: string;
  variant: string;
  rarity: string;
  variant_confidence: VariantConfidence;
};

const IDENTIFY_SYSTEM_PROMPT = `You are a trading card identification expert. Look at this card image VERY carefully. Read ALL text on the card including:
- The card name (character/player name)
- The card NUMBER (e.g., "105/086", "25/198") - look at bottom of card
- The full set/series name and any set symbols
- The year of release
- The variant type (Illustration Rare, Full Art, Alt Art, Holo, Reverse Holo, Regular, etc.)
- The rarity symbol and level

Be EXTREMELY specific. Do NOT return generic names. Include the card number and variant type.

Also rate your confidence in the VARIANT/PARALLEL identification specifically:
- "high": you can clearly read variant markings (holo pattern, "Illustration Rare", set symbol, stamp, foil, numbered, etc.) and are certain.
- "medium": the variant is likely but some indicators are ambiguous (lighting/glare/cropped edge).
- "low": you cannot confidently distinguish this from other parallels/variants of the same card.

Respond with ONLY valid JSON in this exact format:
{
  "card_name": "Full character/player name on the card",
  "card_number": "Card number as printed (e.g., '105/086'). Empty string if not visible.",
  "card_set": "Full set/series name",
  "card_year": "Year of release",
  "variant": "Variant type: Illustration Rare, Full Art, Alt Art, Holo, Reverse Holo, Regular, etc.",
  "rarity": "Rarity level",
  "variant_confidence": "high" | "medium" | "low"
}`;

const USER_MSG =
  "Identify this trading card with maximum specificity. Read the card number, variant type, and all visible text.";

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function normalizeImage(
  input: string,
): Promise<{ base64: string; mimeType: string } | null> {
  try {
    if (/^https?:\/\//i.test(input)) {
      const res = await fetch(input);
      if (!res.ok) {
        console.error("[gemini] image fetch failed", res.status, input.slice(0, 120));
        return null;
      }
      const mimeType = res.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
      const buf = new Uint8Array(await res.arrayBuffer());
      return { base64: bytesToBase64(buf), mimeType };
    }
    const dataMatch = input.match(/^data:([^;]+);base64,(.*)$/);
    if (dataMatch) return { mimeType: dataMatch[1], base64: dataMatch[2] };
    return { base64: input, mimeType: "image/jpeg" };
  } catch (err) {
    console.error("[gemini] normalizeImage error", err);
    return null;
  }
}

function parseJsonLoose(text: string): any | null {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const m = text.match(/```json\n?([\s\S]*?)\n?```/) || text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[1] || m[0]);
    } catch {
      return null;
    }
  }
}

function normalizeResult(parsed: any): CardIdentification {
  const s = (v: unknown) => (v == null ? "" : String(v));
  const rawVc = String(parsed?.variant_confidence ?? parsed?.variantConfidence ?? "").toLowerCase();
  const vc: VariantConfidence = rawVc === "high" || rawVc === "medium" || rawVc === "low" ? (rawVc as VariantConfidence) : "medium";
  return {
    card_name: s(parsed?.card_name ?? parsed?.cardName),
    card_number: s(parsed?.card_number ?? parsed?.cardNumber),
    card_set: s(parsed?.card_set ?? parsed?.cardSet),
    card_year: s(parsed?.card_year ?? parsed?.cardYear),
    variant: s(parsed?.variant),
    rarity: s(parsed?.rarity),
    variant_confidence: vc,
  };
}

/** Why the last vision call failed on BOTH routes (null when it succeeded). */
export type GeminiFailure = "rate_limited" | "credits_exhausted" | "error";
export let lastGeminiFailure: GeminiFailure | null = null;

const DIRECT_TIMEOUT_MS = 6000;

type VisionReq = {
  img: { base64: string; mimeType: string };
  system?: string;
  prompt: string;
  model: string;
  maxOutputTokens?: number;
};

async function callGoogleDirect(r: VisionReq): Promise<string | null> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) { console.warn("[gemini] route=direct skipped: no key"); return null; }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), DIRECT_TIMEOUT_MS);
  const t0 = Date.now();
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(r.model)}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(r.system ? { system_instruction: { parts: [{ text: r.system }] } } : {}),
        contents: [{ role: "user", parts: [{ inline_data: { mime_type: r.img.mimeType, data: r.img.base64 } }, { text: r.prompt }] }],
        generationConfig: { responseMimeType: "application/json", thinkingConfig: { thinkingLevel: "low" }, ...(r.maxOutputTokens ? { maxOutputTokens: r.maxOutputTokens } : {}) },
      }),
    });
    if (!res.ok) { console.warn("[gemini] route=direct failed HTTP", res.status, (await res.text().catch(() => "")).slice(0, 200)); return null; }
    const data = await res.json();
    const finish = data?.candidates?.[0]?.finishReason;
    const u = data?.usageMetadata ?? {};
    console.log(`[gemini] route=direct finish=${finish} thoughts=${u.thoughtsTokenCount ?? 0} out=${u.candidatesTokenCount ?? 0} ms=${Date.now() - t0}`);
    if (finish === "MAX_TOKENS") console.warn("[gemini] route=direct hit MAX_TOKENS cap", r.maxOutputTokens);
    const text = (data?.candidates?.[0]?.content?.parts ?? []).map((p: any) => p?.text ?? "").join("").trim();
    return text || null;
  } catch (err) {
    console.warn("[gemini] route=direct failed", (err as Error)?.name === "AbortError" ? "timeout" : String(err));
    return null;
  } finally { clearTimeout(t); }
}

async function callGateway(r: VisionReq): Promise<string | null> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) { console.error("[gemini] route=gateway skipped: no LOVABLE_API_KEY"); lastGeminiFailure = "error"; return null; }
  const model = r.model.includes("/") ? r.model : `google/${r.model}`;
  const t0 = Date.now();
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          ...(r.system ? [{ role: "system", content: r.system }] : []),
          { role: "user", content: [
            { type: "image_url", image_url: { url: `data:${r.img.mimeType};base64,${r.img.base64}` } },
            { type: "text", text: r.prompt },
          ] },
        ],
        response_format: { type: "json_object" },
        reasoning_effort: "low",
        ...(r.maxOutputTokens ? { max_tokens: r.maxOutputTokens } : {}),
      }),
    });
    if (!res.ok) {
      lastGeminiFailure = res.status === 429 ? "rate_limited" : res.status === 402 ? "credits_exhausted" : "error";
      console.error("[gemini] route=gateway failed", lastGeminiFailure, res.status, (await res.text().catch(() => "")).slice(0, 200));
      return null;
    }
    const data = await res.json();
    const finish = data?.choices?.[0]?.finish_reason;
    const u = data?.usage ?? {};
    console.log(`[gemini] route=gateway finish=${finish} thoughts=${u.completion_tokens_details?.reasoning_tokens ?? 0} out=${u.completion_tokens ?? 0} ms=${Date.now() - t0}`);
    if (finish === "length") console.warn("[gemini] route=gateway hit max_tokens cap", r.maxOutputTokens);
    const c = data?.choices?.[0]?.message?.content;
    const text = (Array.isArray(c) ? c.map((p: any) => p?.text ?? "").join("") : String(c ?? "")).trim();
    if (!text) lastGeminiFailure = "error";
    return text || null;
  } catch (err) {
    lastGeminiFailure = "error";
    console.error("[gemini] route=gateway error", err);
    return null;
  }
}

/** Google direct first; on any failure (incl. unparseable output) fall back to the built-in gateway. */
async function visionJsonWithFallback(r: VisionReq): Promise<any | null> {
  lastGeminiFailure = null;
  const direct = await callGoogleDirect(r);
  const dp = direct ? parseJsonLoose(direct) : null;
  if (direct && !dp) console.warn("[gemini] route=direct unparseable:", direct.slice(0, 300));
  if (dp) { console.log("[gemini] route=direct"); return dp; }
  const gw = await callGateway(r);
  const gp = gw ? parseJsonLoose(gw) : null;
  if (gw && !gp) console.warn("[gemini] route=gateway unparseable:", gw.slice(0, 300));
  if (gp) { console.log("[gemini] route=gateway"); lastGeminiFailure = null; return gp; }
  if (!lastGeminiFailure) lastGeminiFailure = "error";
  return null;
}

export async function identifyWithGemini(
  imageInput: string,
  model: string = "gemini-3.5-flash",
): Promise<CardIdentification | null> {
  const img = await normalizeImage(imageInput);
  if (!img) return null;
  const parsed = await visionJsonWithFallback({ img, system: IDENTIFY_SYSTEM_PROMPT, prompt: USER_MSG, model });
  return parsed ? normalizeResult(parsed) : null;
}

/** Generic vision → JSON call. Returns parsed JSON or null. */
export async function geminiVisionJson(imageInput: string, prompt: string, model: string = "gemini-3.5-flash", maxOutputTokens?: number): Promise<any | null> {
  const img = await normalizeImage(imageInput);
  if (!img) return null;
  return await visionJsonWithFallback({ img, prompt, model, maxOutputTokens });
}
