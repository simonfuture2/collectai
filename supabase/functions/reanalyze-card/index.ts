// Client-callable wrapper that re-runs the full enrich-card pipeline for an
// existing card row the user already owns. Validates ownership, regenerates a
// signed image URL from the stored image_path, and dispatches enrich-card.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { PRICE_ONLY_UPGRADE_CREDITS, FREE_SCANS_PER_HOUR, PRO_SCANS_PER_HOUR, billingFor, isProAccess } from "./rules.ts";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid auth" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = z.object({ cardId: z.string().uuid(), priceOnlyUpgrade: z.boolean().optional() }).safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Valid cardId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { cardId, priceOnlyUpgrade } = parsed.data;

    const supabaseAdmin = createClient(supabaseUrl, serviceKey);
    const { data: card, error: cardErr } = await supabaseAdmin
      .from("cards")
      .select("id, user_id, image_url, category, analysis_depth, analysis_status, analysis_started_at, card_name, card_set, card_number, variant, pricecharting_id")
      .eq("id", cardId)
      .maybeSingle();
    if (cardErr || !card) {
      return new Response(JSON.stringify({ error: "Card not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (card.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!card.image_url) {
      return new Response(JSON.stringify({ error: "Card has no image to re-analyze" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate a fresh signed URL from the stored path.
    let signedUrl: string;
    const imagePath = String(card.image_url);
    if (imagePath.startsWith("http")) {
      signedUrl = imagePath;
    } else {
      const { data: signed, error: signErr } = await supabaseAdmin.storage
        .from("card-images")
        .createSignedUrl(imagePath, 3600);
      if (signErr || !signed?.signedUrl) {
        console.error("[reanalyze-card] sign failed:", signErr);
        return new Response(JSON.stringify({ error: "Could not access card image" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      signedUrl = signed.signedUrl;
    }

    const billing = billingFor(card as any);
    if (billing === "busy") return json({ error: "Analysis is already running for this card" }, 409);

    const { data: creditsRow } = await supabaseAdmin.from("user_credits")
      .select("credits, plan, beta_access_until").eq("user_id", user.id).maybeSingle();
    const isPro = isProAccess(creditsRow as any);
    const charged = billing === "charge" && !isPro;

    if (billing === "charge") {
      const cap = isPro ? PRO_SCANS_PER_HOUR : FREE_SCANS_PER_HOUR;
      const { count } = await supabaseAdmin.from("credit_transactions")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id).eq("type", "scan").gte("created_at", new Date(Date.now() - 3600_000).toISOString());
      if ((count ?? 0) >= cap) return json({ error: `Rate limit exceeded — max ${cap} scans per hour.` }, 429);
      if (!isPro && (creditsRow?.credits ?? 0) < 1) return json({ error: "Insufficient credits" }, 402);
    }

    // Claim the row against its current status so concurrent requests can't double-charge.
    const prev = { analysis_status: card.analysis_status, analysis_started_at: card.analysis_started_at };
    let claim = supabaseAdmin.from("cards").update({
      analysis_status: "identifying", analysis_started_at: new Date().toISOString(),
      analysis_completed_at: null, analysis_error: null,
    }).eq("id", cardId).eq("user_id", user.id).eq("analysis_status", card.analysis_status);
    claim = card.analysis_started_at ? claim.eq("analysis_started_at", card.analysis_started_at) : claim.is("analysis_started_at", null);
    const { data: claimed } = await claim.select("id").maybeSingle();
    if (!claimed) return json({ error: "Analysis has already been requested for this card" }, 409);

    if (charged) {
      const { data: remaining, error: creditError } = await supabaseAdmin.rpc("deduct_credit", { _user_id: user.id });
      if (creditError || remaining == null || remaining < 0) {
        await supabaseAdmin.from("cards").update(prev).eq("id", cardId);
        return json({ error: "Insufficient credits" }, 402);
      }
    }
    if (billing === "charge") {
      await supabaseAdmin.from("credit_transactions").insert({
        user_id: user.id, amount: charged ? -PRICE_ONLY_UPGRADE_CREDITS : 0, type: "scan",
        description: `${card.analysis_depth === "price_only" ? "Full analysis upgrade" : "Re-analysis"}: card ${cardId}`,
      });
    }

    const isUpgrade = card.analysis_depth === "price_only";
    const ladderMatch = isUpgrade ? {
      name: card.card_name, number: (card as any).card_number ?? null,
      set: card.card_set, variant: (card as any).variant ?? null,
    } : undefined;

    let dispatched = false;
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/enrich-card`, {
        method: "POST",
        headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          cardId, images: [{ label: "Front", url: signedUrl }],
          category: card.category || "Trading Card", fastScan: false,
          identityHint: ladderMatch, pricechartingId: isUpgrade ? card.pricecharting_id : undefined,
        }),
      });
      dispatched = res.ok;
      if (!res.ok) console.error("[reanalyze-card] enrich dispatch status", res.status, await res.text());
    } catch (err) {
      console.error("[reanalyze-card] enrich dispatch failed:", err);
    }

    if (!dispatched) {
      if (charged) {
        await supabaseAdmin.rpc("add_credits", { _user_id: user.id, _amount: PRICE_ONLY_UPGRADE_CREDITS });
        await supabaseAdmin.from("credit_transactions").insert({
          user_id: user.id, amount: PRICE_ONLY_UPGRADE_CREDITS, type: "refund",
          description: `Refund: analysis could not start for card ${cardId}`,
        });
      }
      await supabaseAdmin.from("cards").update(prev).eq("id", cardId);
      return json({ error: "Analysis could not start. You were not charged." }, 503);
    }

    console.log(`[reanalyze-card] dispatched card=${cardId} user=${user.id} billing=${billing} charged=${charged}`);

    return new Response(JSON.stringify({ status: "started", cardId, charged }), {
      status: 202,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[reanalyze-card] error:", err);
    return new Response(JSON.stringify({ error: "Re-analysis failed to start" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
