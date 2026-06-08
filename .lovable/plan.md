
## Context

I fetched https://www.pricecharting.com/api-documentation. The current `supabase/functions/_shared/pricecharting.ts` has two real bugs against the live API:

1. It calls `/api/sales` for "recent sales" — **that endpoint does not exist**. The Prices API explicitly says: *"Historic prices and historic sales are not supported."* So `recentSales` cannot come from PriceCharting at all and must be removed (or hard-set to `[]`).
2. The graded-price field names in `extractGradedPrices` (`psa-10-price`, `psa-9-price`, etc.) **do not exist**. PriceCharting uses overloaded generic keys whose meaning depends on whether the product is a card.

The correct card-grade mapping from the docs:

| PriceCharting key      | Card meaning              |
| ---------------------- | ------------------------- |
| `loose-price`          | Ungraded (raw)            |
| `new-price`            | PSA 8 / BGS 8             |
| `cib-price`            | PSA 7 / 7.5               |
| `graded-price`         | PSA 9                     |
| `manual-only-price`    | **PSA 10**                |
| `box-only-price`       | BGS 9.5                   |
| `bgs-10-price`         | BGS 10                    |
| `condition-17-price`   | CGC 10                    |
| `condition-18-price`   | SGC 10                    |

Other relevant facts:

- Base URL: `https://www.pricecharting.com`
- Auth: `?t=<API_KEY>` query param (40-char token)
- Single product: `GET /api/product?t=...&id=...` (or `&upc=...`, `&q=<freetext>`)
- Multi search: `GET /api/products?t=...&q=...` returns up to 20 matches with `{id, product-name, console-name}` only (no prices)
- All prices are integer pennies → divide by 100
- Rate limit: 1 request/second; CSV calls limited to 1 / 10 min (not used here)
- Status is `success` or `error` (with `error-message`)

## Plan

### 1. Save the mapping as project memory so future edits use it

Create `mem://integration/pricecharting` with the endpoint list, auth shape, card-grade field mapping, and the "no historical sales" rule. Update `mem://index.md` to reference it.

### 2. Rewrite `supabase/functions/_shared/pricecharting.ts`

Keep the exported signature stable so callers don't change:

```ts
export type CardId = { card_name; card_number; card_set; card_year; variant; rarity };

export type PriceChartingResult = {
  matched: boolean;
  productName?: string;
  consoleName?: string;       // PriceCharting "category", e.g. "Pokemon Scarlet & Violet"
  productId?: string;
  marketValue?: number;       // loose-price in $
  gradedPrices?: {            // any subset, in $
    psa7?: number; psa8?: number; psa9?: number; psa10?: number;
    bgs95?: number; bgs10?: number; cgc10?: number; sgc10?: number;
  };
  recentSales: [];            // always empty — API doesn't expose this
  source: "pricecharting";
  fetchedAt: string;          // ISO
  reason?: string;            // populated when matched=false
};

export async function getPriceChartingData(cardId: CardId): Promise<PriceChartingResult>;
```

Implementation details:

- Build query string by joining `card_name`, `card_number`, `card_set`, `variant` (skip empty / "Regular" / "Standard"). Always include card_name.
- Call `/api/product?t=KEY&q=<query>` first. PriceCharting returns the single best match.
- If status is not "success" or the returned `product-name` doesn't share at least one significant token with `card_name`, retry once with a looser query (drop `card_number`). If still no good match → `{ matched: false, reason: "no_match", recentSales: [], ... }`.
- On match, build `gradedPrices` using the table above. Only include keys whose source field is present and > 0 after the penny→dollar conversion.
- `marketValue` = `loose-price` in dollars (raw ungraded — the "raw market value" callers want).
- Wrap everything in try/catch. Any throw, non-2xx, missing API key, or JSON parse failure returns `{ matched: false, reason: "<short reason>", recentSales: [], source, fetchedAt }`. Log the failure with `console.error("[pricecharting] ...")` but never re-throw.
- Add a small in-module timeout (8s via `AbortController`) so a hung PriceCharting call can't stall analyze-card / quick-scan.

### 3. Out of scope (not touching this prompt)

- Wiring `getPriceChartingData` into `analyze-card` / `quick-scan` — that's the next prompt.
- Recent sales: if you ever want them, they'd have to come from eBay (already done via Firecrawl) or PriceCharting's HTML scraping, not the API.

Confirm and I'll implement both the memory file and the helper rewrite.
