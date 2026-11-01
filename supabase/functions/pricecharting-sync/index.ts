// Daily sync of PriceCharting CSV price guides into public.pricecharting_catalog.
// Trigger via pg_cron + pg_net, or manually via curl. No JWT verification.

import { createClient } from "npm:@supabase/supabase-js@2";
import { parse } from "npm:csv-parse@5/sync";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { fetchProductById, normalizeLadder } from "../_shared/pricecharting.ts";
import { liveRefreshDue, refreshDecision, type Ladder } from "../_shared/pcValuation.ts";

const LIVE_REFRESH_CAP = 150;
const SPORTS_RE = /sport|baseball|basketball|football|hockey|soccer/i;

// Cards whose product isn't in the stored list: throttled live API, at most once per 7 days.
async function refreshLiveOnlyCards(supabase: any) {
  const cutoff = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data: cards } = await supabase
    .from("cards")
    .select("id, user_id, category, pricecharting_id, pc_synced_at, analysis_depth, ai_analysis, estimated_value_low, estimated_value_high")
    .not("pricecharting_id", "is", null)
    .or(`pc_synced_at.is.null,pc_synced_at.lt.${cutoff}`)
    .order("pc_synced_at", { ascending: true, nullsFirst: true })
    .limit(LIVE_REFRESH_CAP * 3);
  if (!cards?.length) return { checked: 0, refreshed: 0, revalued: 0 };
  const ids = [...new Set(cards.map((c: any) => c.pricecharting_id))];
  const { data: inCatalog } = await supabase.from("pricecharting_catalog").select("id").in("id", ids);
  const stored = new Set((inCatalog || []).map((r: any) => Number(r.id)));
  const due = cards.filter((c: any) => !stored.has(Number(c.pricecharting_id)) && liveRefreshDue(c.pc_synced_at)).slice(0, LIVE_REFRESH_CAP);
  let refreshed = 0, revalued = 0;
  for (const c of due) {
    const row = await fetchProductById(c.pricecharting_id, SPORTS_RE.test(String(c.category || "")));
    if (!row) continue;
    const ladder = normalizeLadder(row) as Ladder;
    const d = refreshDecision(c, ladder);
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { pc_prices: ladder, pc_synced_at: now };
    if (d.revalue) {
      patch.estimated_value_low = d.low;
      patch.estimated_value_high = d.high;
      if (c.ai_analysis) patch.ai_analysis = { ...c.ai_analysis, pcValue: d.value, pcLadder: ladder, estimatedValueLow: d.low, estimatedValueHigh: d.high };
    }
    const { error } = await supabase.from("cards").update(patch).eq("id", c.id);
    if (error) { console.error("[pricecharting-sync] live update", c.id, error.message); continue; }
    refreshed++;
    if (d.revalue) {
      await supabase.from("price_history").insert({
        card_id: c.id, user_id: c.user_id, source: "pricecharting",
        median_price: d.value, low_price: d.value, high_price: d.value, price_count: 1, raw_prices: [d.value],
      });
      revalued++;
    }
  }
  return { checked: due.length, refreshed, revalued };
}

const CATEGORIES = [
  "pokemon-cards",
  "magic-cards",
  "yugioh-cards",
  "onepiece-cards",
  "lorcana-cards",
  "dragon-ball-cards",
  "video-games",
];

const BASE = "https://www.pricecharting.com/price-guide/download-custom";
const CHUNK_SIZE = 1000;

type Row = Record<string, unknown>;

// Headers we know how to map. Anything else in the CSV is ignored.
const HEADER_MAP: Record<string, string> = {
  "id": "id",
  "product-name": "product_name",
  "console-name": "console_name",
  "loose-price": "loose_price",
  "cib-price": "cib_price",
  "new-price": "new_price",
  "graded-price": "graded_price",
  "box-only-price": "box_only_price",
  "manual-only-price": "manual_only_price",
  "bgs-10-price": "bgs_10_price",
  "condition-17-price": "condition_17_price",
  "condition-18-price": "condition_18_price",
  "condition-9-price": "condition_9_price",
  "condition-10-price": "condition_10_price",
  "condition-13-price": "condition_13_price",
  "condition-14-price": "condition_14_price",
  "condition-15-price": "condition_15_price",
  "condition-16-price": "condition_16_price",
  "condition-19-price": "condition_19_price",
  "condition-20-price": "condition_20_price",
  "condition-21-price": "condition_21_price",
  "condition-22-price": "condition_22_price",
  "release-date": "release_date",
  "upc": "upc",
  "asin": "asin",
  "epid": "epid",
  "genre": "genre",
  "retail-loose-buy": "retail_loose_buy",
  "retail-loose-sell": "retail_loose_sell",
  "retail-cib-buy": "retail_cib_buy",
  "retail-cib-sell": "retail_cib_sell",
  "retail-new-buy": "retail_new_buy",
  "retail-new-sell": "retail_new_sell",
  "sales-volume": "sales_volume",
};

const INT_COLUMNS = new Set([
  "id",
  "loose_price",
  "cib_price",
  "new_price",
  "graded_price",
  "box_only_price",
  "manual_only_price",
  "bgs_10_price",
  "condition_17_price",
  "condition_18_price",
  "condition_9_price",
  "condition_10_price",
  "condition_13_price",
  "condition_14_price",
  "condition_15_price",
  "condition_16_price",
  "condition_19_price",
  "condition_20_price",
  "condition_21_price",
  "condition_22_price",
  "retail_loose_buy",
  "retail_loose_sell",
  "retail_cib_buy",
  "retail_cib_sell",
  "retail_new_buy",
  "retail_new_sell",
  "sales_volume",
]);

function toInt(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseInt(String(v).replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

function toDate(v: unknown): string | null {
  if (!v) return null;
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function mapRecord(rec: Record<string, string>, category: string): Row | null {
  const out: Row = { category, last_synced_at: new Date().toISOString() };
  for (const [csvKey, colName] of Object.entries(HEADER_MAP)) {
    const raw = rec[csvKey];
    if (raw === undefined) continue;
    if (colName === "release_date") {
      out[colName] = toDate(raw);
    } else if (INT_COLUMNS.has(colName)) {
      out[colName] = toInt(raw);
    } else {
      out[colName] = raw === "" ? null : raw;
    }
  }
  if (!out.id || !out.product_name) return null;
  return out;
}

async function syncCategory(
  supabase: ReturnType<typeof createClient>,
  apiKey: string,
  category: string,
) {
  const started = Date.now();
  const url = `${BASE}?t=${encodeURIComponent(apiKey)}&category=${encodeURIComponent(category)}`;
  console.log(`[pricecharting-sync] ${category}: fetching CSV`);

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  const csv = await res.text();

  const records = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true,
  }) as Record<string, string>[];

  const rows: Row[] = [];
  let skipped = 0;
  for (const rec of records) {
    const mapped = mapRecord(rec, category);
    if (mapped) rows.push(mapped);
    else skipped++;
  }

  let upserted = 0;
  let errors = 0;
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const { error } = await supabase
      .from("pricecharting_catalog")
      .upsert(chunk, { onConflict: "id" });
    if (error) {
      errors += chunk.length;
      console.error(`[pricecharting-sync] ${category}: upsert error`, error.message);
    } else {
      upserted += chunk.length;
    }
  }

  const ms = Date.now() - started;
  console.log(
    `[pricecharting-sync] ${category}: parsed=${records.length} mapped=${rows.length} skipped=${skipped} upserted=${upserted} errors=${errors} ms=${ms}`,
  );
  return { category, parsed: records.length, upserted, skipped, errors, ms };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Require shared-secret header — this endpoint is invoked only by cron/service callers.
  const expectedSecret = Deno.env.get("PRICECHARTING_SYNC_SECRET");
  const providedSecret =
    req.headers.get("x-internal-key") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!expectedSecret || providedSecret !== expectedSecret) {
    return new Response(
      JSON.stringify({ ok: false, error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }


  try {
    const apiKey = Deno.env.get("PRICECHARTING_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ ok: false, error: "PRICECHARTING_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const results: any[] = [];
    const force = new URL(req.url).searchParams.get("force") === "true";
    const todayStart = new Date().toISOString().slice(0, 10) + "T00:00:00Z";
    for (const category of CATEGORIES) {
      try {
        if (!force) {
          const { count } = await supabase
            .from("pricecharting_catalog")
            .select("id", { count: "exact", head: true })
            .eq("category", category)
            .gte("last_synced_at", todayStart);
          if ((count ?? 0) > 0) {
            console.log(`[pricecharting-sync] ${category}: skipped (already synced today)`);
            results.push({ category, skipped: "already synced today" });
            continue;
          }
        }
        results.push(await syncCategory(supabase, apiKey, category));
      } catch (err) {
        const msg = (err as Error)?.message ?? String(err);
        console.error(`[pricecharting-sync] ${category}: failed`, msg);
        results.push({ category, error: msg });
      }
    }

    const totalUpserted = results.reduce((s, r: any) => s + (r.upserted ?? 0), 0);
    console.log(`[pricecharting-sync] DONE total_upserted=${totalUpserted}`);

    // Refresh saved cards from the stored list (database only), then live-only cards.
    const { data: cardRefresh, error: refreshErr } = await supabase.rpc("pc_refresh_cards_from_catalog");
    if (refreshErr) console.error("[pricecharting-sync] card refresh failed", refreshErr.message);
    else console.log("[pricecharting-sync] card refresh", JSON.stringify(cardRefresh));
    let liveRefresh: unknown = null;
    try {
      liveRefresh = await refreshLiveOnlyCards(supabase);
      console.log("[pricecharting-sync] live refresh", JSON.stringify(liveRefresh));
    } catch (err) {
      console.error("[pricecharting-sync] live refresh failed", (err as Error)?.message);
    }

    return new Response(JSON.stringify({ ok: true, totalUpserted, results, cardRefresh, liveRefresh }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = (err as Error)?.message ?? String(err);
    console.error("[pricecharting-sync] fatal", msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
