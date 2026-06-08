// Shared, tiered, cross-referenced market-data aggregator.
//
// Gathers prices from INDEPENDENT sources and keeps them separate + attributed:
//   1) PriceCharting (local catalog → live API; sports → SportsCardsPro live)
//   2) eBay sold comps via Firecrawl search (IQR-filtered, fresh-first)
//   3) eBay active asking prices via Firecrawl (separate source)
//   4) TCGPlayer via Firecrawl (TCG only)
//   5) Long-tail Firecrawl broad/fallback ONLY when PC missed and eBay sold is sparse
//
// Returns:
//   - sources: per-source MarketSourceData (median/low/high/count/recencyDays/prices)
//   - blended: weighted headline value normalized over whichever sources are present
//   - crossReference: PriceCharting vs eBay-sold agreement (within ~15%)
//   - summary: human/LLM-readable markdown for downstream prompt context

import { getPriceChartingData, type CardId } from "./pricecharting.ts";

export interface CardIdentification {
  card_name: string;
  card_number?: string;
  card_set?: string;
  card_year?: string;
  variant?: string;
  rarity?: string;
}

export interface MarketSourceData {
  source: string; // ebay_sold | ebay_active | tcgplayer | pricecharting
  median: number;
  low: number;
  high: number;
  count: number;
  recencyDays?: number; // approximate freshness window for the prices
  prices: number[];
}

export interface CrossReference {
  priceChartingValue?: number;
  ebaySoldMedian?: number;
  agreementPct?: number; // |diff| / max * 100
  agree?: boolean; // within ~15%
}

export interface AggregatedMarketData {
  sources: MarketSourceData[];
  blended: { median: number; low: number; high: number } | null;
  crossReference: CrossReference;
  summary: string;
  hasData: boolean;
}

// ---------- helpers ----------

function extractPrices(text: string): number[] {
  const cleaned = text.replace(/\$[\d,]+\.?\d*\s*(shipping|ship|s\/h|postage|delivery)/gi, "");
  const matches = cleaned.match(/\$[\d,]+\.?\d*/g) || [];
  return matches
    .map((m) => parseFloat(m.replace(/[$,]/g, "")))
    .filter((n) => n > 0.99 && n < 100000);
}

function filterOutliers(prices: number[]): number[] {
  if (prices.length < 4) return prices;
  const sorted = [...prices].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  const iqr = q3 - q1;
  return prices.filter((p) => p >= q1 - 1.5 * iqr && p <= q3 + 1.5 * iqr);
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function buildTerms(cardId: CardIdentification, category?: string) {
  const isSports = /sport|baseball|basketball|football|hockey|soccer/i.test(category || "");
  if (isSports) {
    return {
      isSports: true,
      specific: `${cardId.card_name} ${cardId.card_year || ""} ${cardId.card_set || ""}`.trim(),
      broad: `${cardId.card_name} ${cardId.card_year || ""} card`.trim(),
      fallback: `${cardId.card_name} card`.trim(),
    };
  }
  const parts: string[] = [];
  if (cardId.card_name) parts.push(cardId.card_name);
  if (cardId.card_number) parts.push(cardId.card_number);
  if (cardId.variant && !/^(regular|standard|normal)$/i.test(cardId.variant)) parts.push(cardId.variant);
  return {
    isSports: false,
    specific: parts.join(" "),
    broad: `${cardId.card_name} ${cardId.card_set || ""} ${cardId.variant || ""}`.trim(),
    fallback: `${cardId.card_name} ${cardId.card_set || ""} card`.trim(),
  };
}

// ---------- main entry ----------

export async function getMarketData(
  cardId: CardIdentification,
  category?: string,
  fastScan = false,
): Promise<AggregatedMarketData> {
  const sources: MarketSourceData[] = [];
  const cross: CrossReference = {};

  // ===== 1) PriceCharting (independent) =====
  let pcSummary = "";
  try {
    const pcCardId: CardId = { ...cardId, category };
    const pc = await getPriceChartingData(pcCardId);
    if (pc.matched && pc.marketValue && pc.marketValue > 0) {
      sources.push({
        source: "pricecharting",
        median: pc.marketValue,
        low: pc.marketValue,
        high: pc.marketValue,
        count: 1,
        prices: [pc.marketValue],
      });
      cross.priceChartingValue = pc.marketValue;
      pcSummary =
        `\n### PriceCharting (${pc.via || "api"}): ${pc.productName || ""}\n` +
        `- Ungraded (loose): $${pc.marketValue.toFixed(2)}\n` +
        (pc.gradedPrices
          ? `- Graded: ${Object.entries(pc.gradedPrices)
              .map(([k, v]) => `${k}=$${(v as number).toFixed(2)}`)
              .join(", ")}\n`
          : "");
      console.log(`[marketData] PriceCharting matched ($${pc.marketValue.toFixed(2)}, via=${pc.via})`);
    } else {
      console.log(`[marketData] PriceCharting miss: ${pc.reason || "no_match"}`);
    }
  } catch (err) {
    console.error("[marketData] PriceCharting error:", (err as Error)?.message);
  }

  // ===== 2/3/4) Firecrawl eBay + TCGPlayer comps =====
  const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
  const terms = buildTerms(cardId, category);
  const { specific, broad, fallback, isSports } = terms;

  let soldPrices: number[] = [];
  let activePrices: number[] = [];
  let tcgPrices: number[] = [];
  let soldRecencyDays = 30;

  if (FIRECRAWL_API_KEY && cardId.card_name) {
    async function doSearch(query: string, limit: number, urlFilter?: string, tbs = "qdr:m") {
      try {
        const r = await fetch("https://api.firecrawl.dev/v1/search", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query, limit, tbs }),
        });
        if (!r.ok) return [];
        const d = await r.json();
        const results = d.data || [];
        return urlFilter ? results.filter((x: any) => x.url?.includes(urlFilter)) : results;
      } catch {
        return [];
      }
    }

    async function searchSold(query: string, limit: number) {
      const fresh = await doSearch(query, limit, "ebay.com", "qdr:w");
      if (fresh.length >= 2) {
        soldRecencyDays = 7;
        return fresh;
      }
      soldRecencyDays = 30;
      return doSearch(query, limit, "ebay.com", "qdr:m");
    }

    try {
      let [soldResults, activeResults, tcgResults] = await Promise.all([
        searchSold(`"${specific}" sold site:ebay.com`, 8),
        doSearch(`"${specific}" site:ebay.com`, 6, "ebay.com"),
        isSports ? Promise.resolve([]) : doSearch(`"${specific}" price site:tcgplayer.com`, 5, "tcgplayer.com"),
      ]);

      const totalSpecific = soldResults.length + activeResults.length + tcgResults.length;

      // Long-tail fallback: ONLY when PriceCharting missed AND eBay comps are sparse.
      const pcMissed = cross.priceChartingValue === undefined;
      if (!fastScan && pcMissed && totalSpecific < 3 && broad !== specific) {
        console.log("[marketData] PC missed + sparse — trying broader Firecrawl search");
        const [sB, aB, tB] = await Promise.all([
          searchSold(`${broad} sold site:ebay.com`, 8),
          doSearch(`${broad} site:ebay.com`, 6, "ebay.com"),
          isSports ? Promise.resolve([]) : doSearch(`${broad} price site:tcgplayer.com`, 5, "tcgplayer.com"),
        ]);
        if (sB.length + aB.length + tB.length > totalSpecific) {
          soldResults = sB; activeResults = aB; tcgResults = tB;
        }
      }

      const totalAfterBroad = soldResults.length + activeResults.length + tcgResults.length;
      if (!fastScan && pcMissed && totalAfterBroad < 3 && fallback !== broad) {
        console.log("[marketData] still sparse — trying fallback Firecrawl search");
        const [sF, aF] = await Promise.all([
          searchSold(`${fallback} sold site:ebay.com`, 8),
          doSearch(`${fallback} site:ebay.com`, 6, "ebay.com"),
        ]);
        if (sF.length + aF.length > totalAfterBroad) {
          soldResults = sF; activeResults = aF;
        }
      }

      const pushPrices = (arr: any[], bucket: number[]) => {
        arr.slice(0, 8).forEach((r) => {
          const text = `${r.title || ""} ${r.description || ""} ${(r.markdown || "").substring(0, 800)}`;
          bucket.push(...extractPrices(text));
        });
      };
      pushPrices(soldResults, soldPrices);
      pushPrices(activeResults, activePrices);
      pushPrices(tcgResults, tcgPrices);

      soldPrices = filterOutliers(soldPrices);
      activePrices = filterOutliers(activePrices);
      tcgPrices = filterOutliers(tcgPrices);

      console.log(
        `[marketData] Firecrawl results: sold=${soldPrices.length} active=${activePrices.length} tcg=${tcgPrices.length}`,
      );
    } catch (err) {
      console.error("[marketData] Firecrawl search error:", (err as Error)?.message);
    }
  } else if (!FIRECRAWL_API_KEY) {
    console.log("[marketData] FIRECRAWL_API_KEY not configured — skipping comp search");
  }

  if (soldPrices.length > 0) {
    const m = median(soldPrices);
    sources.push({
      source: "ebay_sold",
      median: m,
      low: Math.min(...soldPrices),
      high: Math.max(...soldPrices),
      count: soldPrices.length,
      recencyDays: soldRecencyDays,
      prices: soldPrices,
    });
    cross.ebaySoldMedian = m;
  }
  if (activePrices.length > 0) {
    sources.push({
      source: "ebay_active",
      median: median(activePrices),
      low: Math.min(...activePrices),
      high: Math.max(...activePrices),
      count: activePrices.length,
      prices: activePrices,
    });
  }
  if (tcgPrices.length > 0) {
    sources.push({
      source: "tcgplayer",
      median: median(tcgPrices),
      low: Math.min(...tcgPrices),
      high: Math.max(...tcgPrices),
      count: tcgPrices.length,
      prices: tcgPrices,
    });
  }

  // ===== Cross-reference =====
  if (cross.priceChartingValue !== undefined && cross.ebaySoldMedian !== undefined) {
    const a = cross.priceChartingValue;
    const b = cross.ebaySoldMedian;
    const diffPct = (Math.abs(a - b) / Math.max(a, b)) * 100;
    cross.agreementPct = Math.round((100 - diffPct) * 10) / 10;
    cross.agree = diffPct <= 15;
    console.log(
      `[marketData] cross-ref: PC=$${a.toFixed(2)} vs eBay=$${b.toFixed(2)} → agreement ${cross.agreementPct}% (agree=${cross.agree})`,
    );
  }

  // ===== Blended headline (weights normalized to present sources) =====
  // ebay_sold 0.4, pricecharting 0.3, tcgplayer 0.2, ebay_active 0.1
  const WEIGHTS: Record<string, number> = {
    ebay_sold: 0.4,
    pricecharting: 0.3,
    tcgplayer: 0.2,
    ebay_active: 0.1,
  };
  const weighted = sources
    .map((s) => ({ value: s.median, weight: WEIGHTS[s.source] ?? 0.1 }))
    .filter((x) => x.value > 0);

  let blended: AggregatedMarketData["blended"] = null;
  if (weighted.length > 0) {
    const total = weighted.reduce((s, x) => s + x.weight, 0);
    const m = weighted.reduce((s, x) => s + x.value * (x.weight / total), 0);
    const allPrices = sources.flatMap((s) => s.prices);
    blended = {
      median: m,
      low: allPrices.length ? Math.min(...allPrices) : m,
      high: allPrices.length ? Math.max(...allPrices) : m,
    };
  }

  // ===== Summary =====
  let summary = "";
  const hasData = sources.length > 0;
  if (hasData) {
    summary += "\n\n## REAL MARKET PRICE DATA (multi-source, attributed)\n";
    summary += `Card searched: ${specific}\n`;
    if (pcSummary) summary += pcSummary;
    for (const s of sources) {
      if (s.source === "pricecharting") continue; // already shown
      const label =
        s.source === "ebay_sold"
          ? `eBay SOLD (last ${s.recencyDays || 30} days)`
          : s.source === "ebay_active"
            ? "eBay ACTIVE asking"
            : s.source === "tcgplayer"
              ? "TCGPlayer"
              : s.source;
      summary += `\n### ${label}\n`;
      summary += `- Prices: ${s.prices.map((p) => `$${p.toFixed(2)}`).join(", ")}\n`;
      summary += `- Median: $${s.median.toFixed(2)} | Range: $${s.low.toFixed(2)}-$${s.high.toFixed(2)} | Count: ${s.count}\n`;
    }
    if (cross.priceChartingValue !== undefined && cross.ebaySoldMedian !== undefined) {
      summary += `\n### Cross-reference: PriceCharting $${cross.priceChartingValue.toFixed(2)} vs eBay sold $${cross.ebaySoldMedian.toFixed(2)} → ${cross.agreementPct}% agreement (${cross.agree ? "AGREE" : "DIVERGE"})\n`;
    }
    if (blended) {
      summary += `\n### SUGGESTED BLENDED VALUE: $${blended.median.toFixed(2)} (weights normalized over present sources)\n`;
    }
    summary += `\nCRITICAL: Your estimatedValueLow/High MUST reflect this data.\n`;
  }

  return { sources, blended, crossReference: cross, summary, hasData };
}

// Convenience: persist per-source rows to price_history (each source attributed).
export function buildPriceHistoryRows(
  data: AggregatedMarketData,
  cardDbId: string,
  userId: string,
): Array<Record<string, unknown>> {
  const rows: Array<Record<string, unknown>> = [];
  for (const s of data.sources) {
    rows.push({
      card_id: cardDbId,
      user_id: userId,
      source: s.source,
      median_price: s.median,
      low_price: s.low,
      high_price: s.high,
      price_count: s.count,
      raw_prices: s.prices,
    });
  }
  if (data.blended) {
    rows.push({
      card_id: cardDbId,
      user_id: userId,
      source: "blended",
      median_price: data.blended.median,
      low_price: data.blended.low,
      high_price: data.blended.high,
      price_count: 0,
      raw_prices: [],
    });
  }
  return rows;
}
