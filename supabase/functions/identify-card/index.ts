// Fast phase 1: identify card from images with Claude, save row, deduct credit,
// fire-and-forget the enrich-card pipeline. Returns { cardId } in ~5-15s.
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CardIdentification {
  card_name: string;
  card_number: string;
  card_set: string;
  card_year: string;
  variant: string;
  rarity: string;
}

async function identifyCard(images: { label: string; url: string }[], ANTHROPIC_API_KEY: string): Promise<CardIdentification | null> {
  try {
    const systemPrompt = `You are a trading card identification expert. Look at this card image very carefully. Read ALL text on the card including: card name, card NUMBER (e.g. "105/086"), full set/series name, year of release, variant type (Illustration Rare, Full Art, Alt Art, Holo, Reverse Holo, Regular, etc.), and rarity.

Be specific. Respond with ONLY valid JSON:
{
  "card_name": "Full character/player name on the card",
  "card_number": "Card number as printed (e.g. '105/086'). Empty string if not visible.",
  "card_set": "Full set/series name",
  "card_year": "Year of release",
  "variant": "Variant type",
  "rarity": "Rarity level",
  "category": "Trading Card | Sports Card | Coin | Comic"
}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: "Identify this collectible with maximum specificity." },
            ...images.slice(0, 2).map((img) => ({
              type: "image" as const,
              source: { type: "url" as const, url: img.url },
            })),
          ],
        }],
      }),
    });

    if (!response.ok) {
      console.error("Identification call failed:", response.status);
      return null;
    }
    const data = await response.json();
    const text = data.content?.[0]?.text;
    if (!text) return null;
    const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/) || text.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : text;
    return JSON.parse(jsonStr);
  } catch (err) {
    console.error("Card identification failed:", err);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const token = authHeader.replace("Bearer ", "");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid auth" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    // Rate limit: 10/hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recentScans } = await supabaseAdmin
      .from("credit_transactions")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id).eq("type", "scan").gte("created_at", oneHourAgo);
    if ((recentScans ?? 0) >= 10) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded — max 10 scans per hour." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: creditsData } = await supabaseAdmin
      .from("user_credits").select("credits, plan").eq("user_id", user.id).single();
    const isPro = creditsData?.plan === "pro";
    const hasCredits = (creditsData?.credits ?? 0) > 0;
    if (!isPro && !hasCredits) {
      return new Response(JSON.stringify({ error: "Insufficient credits." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const images: { label: string; url: string }[] = body.images || [];
    if (images.length === 0 && body.imageUrl) images.push({ label: "Front", url: body.imageUrl });
    if (images.length === 0) {
      return new Response(JSON.stringify({ error: "At least one image is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Validate URLs (must be signed URLs from card-images bucket, owned by user)
    const ALLOWED_BUCKET = "card-images";
    const signedUrlPattern = `${supabaseUrl}/storage/v1/object/sign/${ALLOWED_BUCKET}/`;
    for (const img of images) {
      if (!img.url.startsWith(signedUrlPattern)) {
        return new Response(JSON.stringify({ error: `Invalid image URL for "${img.label}"` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      try {
        const url = new URL(img.url);
        const parts = url.pathname.split("/");
        const idx = parts.indexOf("card-images");
        if (idx === -1 || parts[idx + 1] !== user.id) {
          return new Response(JSON.stringify({ error: "Unauthorized image" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      } catch {
        return new Response(JSON.stringify({ error: "Invalid URL" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // Extract file path from first image
    let imagePath = "";
    try {
      const url = new URL(images[0].url);
      const parts = url.pathname.split("/");
      const idx = parts.indexOf("card-images");
      if (idx !== -1) imagePath = parts.slice(idx + 1).join("/");
    } catch {}
    if (!imagePath) imagePath = body.filePath || images[0].url;

    // Duplicate check
    const { data: existingCard } = await supabaseAdmin
      .from("cards").select("id").eq("user_id", user.id).eq("image_url", imagePath).maybeSingle();
    if (existingCard) {
      return new Response(JSON.stringify({ cardId: existingCard.id, duplicate: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Phase 1: identify with Claude
    console.log(`[identify-card] identifying for user=${user.id}`);
    const identification = await identifyCard(images, ANTHROPIC_API_KEY);
    if (!identification?.card_name) {
      return new Response(JSON.stringify({ error: "Could not identify card. Please try a clearer image." }), { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    console.log(`[identify-card] identified: ${identification.card_name}`);

    const category = (identification as any).category || body.category || "Trading Card";

    // Insert card row with analysis_status='analyzing'
    const { data: savedCard, error: insertErr } = await supabaseAdmin
      .from("cards")
      .insert({
        user_id: user.id,
        image_url: imagePath,
        category,
        card_name: identification.card_name,
        card_set: identification.card_set || null,
        card_year: identification.card_year || null,
        edition: null,
        rarity: identification.rarity || null,
        condition_grade: null,
        special_features: [],
        last_scanned_at: new Date().toISOString(),
        analysis_status: "analyzing",
        analysis_started_at: new Date().toISOString(),
      })
      .select("id").single();

    if (insertErr || !savedCard) {
      console.error("Failed to save card:", insertErr);
      return new Response(JSON.stringify({ error: "Failed to save card" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Deduct credit
    if (!isPro) {
      const { data: remaining } = await supabaseAdmin.rpc("deduct_credit", { _user_id: user.id });
      if (remaining !== -1) {
        await supabaseAdmin.from("credit_transactions").insert({
          user_id: user.id, amount: -1, type: "scan",
          description: `AI scan: ${identification.card_name}`,
        });
      }
    }

    // Fire-and-forget enrichment via direct fetch (don't await)
    const enrichUrl = `${supabaseUrl}/functions/v1/enrich-card`;
    const enrichPromise = fetch(enrichUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        cardId: savedCard.id,
        images,
        identification,
        category,
        fastScan: body.fastScan === true,
      }),
    }).catch((err) => console.error("[identify-card] enrich dispatch failed:", err));

    // @ts-ignore
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(enrichPromise);
    }

    return new Response(JSON.stringify({
      cardId: savedCard.id,
      cardName: identification.card_name,
      cardSet: identification.card_set,
      cardYear: identification.card_year,
      category,
      analysisStatus: "analyzing",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: any) {
    console.error("Error in identify-card:", error);
    return new Response(JSON.stringify({ error: error?.message || "Identification failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
