import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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

const USER_MSG = "Identify this trading card with maximum specificity. Read the card number, variant type, and all visible text.";

function parseJsonLoose(text: string): any | null {
  if (!text) return null;
  const m = text.match(/```json\n?([\s\S]*?)\n?```/) || text.match(/\{[\s\S]*\}/);
  const s = m ? (m[1] || m[0]) : text;
  try { return JSON.parse(s); } catch { return null; }
}

async function callGemini(model: string, imageUrl: string, apiKey: string) {
  const start = Date.now();
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: IDENTIFY_SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: USER_MSG },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
        ],
      }),
    });
    const latency_ms = Date.now() - start;
    if (!res.ok) {
      const errText = await res.text();
      return { error: `HTTP ${res.status}: ${errText.slice(0, 200)}`, latency_ms, result: null };
    }
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content ?? "";
    const parsed = parseJsonLoose(typeof text === "string" ? text : JSON.stringify(text));
    return { result: parsed, latency_ms, error: parsed ? null : "Parse failed", raw: parsed ? undefined : text };
  } catch (err) {
    return { error: String((err as Error).message ?? err), latency_ms: Date.now() - start, result: null };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await authClient.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: roleData } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action;

    if (action === "save_truth") {
      const { cardId, truth } = body;
      if (!cardId || !truth) {
        return new Response(JSON.stringify({ error: "cardId and truth required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const payload = {
        card_id: cardId,
        card_name: truth.card_name ?? null,
        card_number: truth.card_number ?? null,
        card_set: truth.card_set ?? null,
        card_year: truth.card_year ?? null,
        variant: truth.variant ?? null,
        rarity: truth.rarity ?? null,
        notes: truth.notes ?? null,
        created_by: userData.user.id,
        updated_at: new Date().toISOString(),
      };
      const { error } = await admin.from("bakeoff_truth").upsert(payload, { onConflict: "card_id" });
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "run") {
      if (!LOVABLE_API_KEY) {
        return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const cardIds: string[] | undefined = body.cardIds;
      const limit: number = Math.min(Math.max(Number(body.limit) || 10, 1), 50);

      let query = admin
        .from("cards")
        .select("id, user_id, image_url, ai_analysis, created_at")
        .eq("user_id", userData.user.id)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (Array.isArray(cardIds) && cardIds.length > 0) {
        query = admin
          .from("cards")
          .select("id, user_id, image_url, ai_analysis, created_at")
          .in("id", cardIds);
      }

      const { data: cards, error: cardsErr } = await query;
      if (cardsErr) throw cardsErr;

      const truthRes = await admin
        .from("bakeoff_truth")
        .select("*")
        .in("card_id", (cards ?? []).map((c: any) => c.id));
      const truthMap: Record<string, any> = {};
      for (const t of truthRes.data ?? []) truthMap[t.card_id] = t;

      const results = [];
      for (const card of cards ?? []) {
        try {
          // Sign URL for the card image. image_url may already be a public URL or a storage path.
          let imageUrl: string | null = null;
          const stored = card.image_url as string | null;
          if (stored) {
            if (stored.startsWith("http")) {
              imageUrl = stored;
            } else {
              const { data: signed } = await admin.storage
                .from("card-images")
                .createSignedUrl(stored, 600);
              imageUrl = signed?.signedUrl ?? null;
            }
          }

          if (!imageUrl) {
            results.push({
              cardId: card.id, image_url: null,
              claude: card.ai_analysis ?? null,
              gemini_flash: { error: "no image", result: null, latency_ms: 0 },
              gemini_pro: { error: "no image", result: null, latency_ms: 0 },
              truth: truthMap[card.id] ?? null,
            });
            continue;
          }

          const [flash, pro] = await Promise.all([
            callGemini("google/gemini-3.5-flash", imageUrl, LOVABLE_API_KEY),
            callGemini("google/gemini-3.1-pro-preview", imageUrl, LOVABLE_API_KEY),
          ]);

          const claude = card.ai_analysis ?? null;
          results.push({
            cardId: card.id,
            image_url: imageUrl,
            claude: claude ? {
              card_name: claude.cardName ?? claude.card_name ?? null,
              card_number: claude.cardNumber ?? claude.card_number ?? null,
              card_set: claude.cardSet ?? claude.card_set ?? null,
              card_year: claude.cardYear ?? claude.card_year ?? null,
              variant: claude.variant ?? null,
              rarity: claude.rarity ?? null,
            } : null,
            gemini_flash: flash,
            gemini_pro: pro,
            truth: truthMap[card.id] ?? null,
          });
        } catch (err) {
          results.push({
            cardId: card.id,
            error: String((err as Error).message ?? err),
            truth: truthMap[card.id] ?? null,
          });
        }
      }

      return new Response(JSON.stringify({ results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[id-bakeoff] error:", err);
    return new Response(JSON.stringify({ error: String((err as Error).message ?? err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
