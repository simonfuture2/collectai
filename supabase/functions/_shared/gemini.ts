// Shared helper: call Google's Generative Language API directly to identify a trading card.
// Returns the canonical CardIdentification shape used elsewhere in the project, or null on failure.

export type CardIdentification = {
  card_name: string;
  card_number: string;
  card_set: string;
  card_year: string;
  variant: string;
  rarity: string;
};

const IDENTIFY_SYSTEM_PROMPT = `You are a trading card identification expert. Look at this card image VERY carefully. Read ALL text on the card including:
- The card name (character/player name)
- The card NUMBER (e.g., "105/086", "25/198") - look at bottom of card
- The full set/series name and any set symbols
- The year of release
- The variant type (Illustration Rare, Full Art, Alt Art, Holo, Reverse Holo, Regular, etc.)
- The rarity symbol and level

Be EXTREMELY specific. Do NOT return generic names. Include the card number and variant type.

Respond with ONLY valid JSON in this exact format:
{
  "card_name": "Full character/player name on the card",
  "card_number": "Card number as printed (e.g., '105/086'). Empty string if not visible.",
  "card_set": "Full set/series name",
  "card_year": "Year of release",
  "variant": "Variant type: Illustration Rare, Full Art, Alt Art, Holo, Reverse Holo, Regular, etc.",
  "rarity": "Rarity level"
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
  return {
    card_name: s(parsed?.card_name ?? parsed?.cardName),
    card_number: s(parsed?.card_number ?? parsed?.cardNumber),
    card_set: s(parsed?.card_set ?? parsed?.cardSet),
    card_year: s(parsed?.card_year ?? parsed?.cardYear),
    variant: s(parsed?.variant),
    rarity: s(parsed?.rarity),
  };
}

export async function identifyWithGemini(
  imageInput: string,
  model: string = "gemini-3.5-flash",
): Promise<CardIdentification | null> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    console.error("[gemini] GEMINI_API_KEY not configured");
    return null;
  }

  const img = await normalizeImage(imageInput);
  if (!img) return null;

  try {
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: IDENTIFY_SYSTEM_PROMPT }] },
        contents: [
          {
            role: "user",
            parts: [
              { inline_data: { mime_type: img.mimeType, data: img.base64 } },
              { text: USER_MSG },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          thinkingConfig: { thinkingLevel: "low" },
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[gemini] HTTP", res.status, body.slice(0, 500));
      return null;
    }

    const data = await res.json();
    const parts = data?.candidates?.[0]?.content?.parts ?? [];
    const text = parts.map((p: any) => p?.text ?? "").join("").trim();
    const parsed = parseJsonLoose(text);
    if (!parsed) {
      console.error("[gemini] parse failed", text.slice(0, 300));
      return null;
    }
    return normalizeResult(parsed);
  } catch (err) {
    console.error("[gemini] request error", err);
    return null;
  }
}
