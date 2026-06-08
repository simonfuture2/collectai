## Goal

Stop hitting PriceCharting's `/api/product` per scan. Instead, mirror their full CSV price guide for the categories we care about into a local `pricecharting_catalog` table, refreshed daily. Future lookups become a cheap Postgres query keyed by `product-name` / `console-name`.

## 1. Secret

`PRICECHARTING_API_KEY` is already configured (confirmed via fetch_secrets). No action needed.

## 2. New table: `public.pricecharting_catalog`

Column names match PriceCharting's CSV headers 1:1 so the parser can map directly (hyphens → underscores only where Postgres requires it; we'll keep hyphenated names quoted to preserve the 1:1 mapping — alternative: use snake_case and a small header→column map. Recommending **snake_case** to avoid quoting every query. Mapping is trivial.)

Columns (all nullable except `id`, `product_name`, `category`):

| Column                  | Type        | PriceCharting CSV header   |
| ----------------------- | ----------- | -------------------------- |
| `id`                    | bigint PK   | `id`                       |
| `product_name`          | text        | `product-name`             |
| `console_name`          | text        | `console-name`             |
| `category`              | text        | (our tag: pokemon-cards, magic-cards, yugioh-cards, onepiece-cards, video-games) |
| `loose_price`           | int (cents) | `loose-price`              |
| `cib_price`             | int         | `cib-price`                |
| `new_price`             | int         | `new-price`                |
| `graded_price`          | int         | `graded-price`             |
| `box_only_price`        | int         | `box-only-price`           |
| `manual_only_price`     | int         | `manual-only-price`        |
| `bgs_10_price`          | int         | `bgs-10-price`             |
| `condition_17_price`    | int         | `condition-17-price`       |
| `condition_18_price`    | int         | `condition-18-price`       |
| `release_date`          | date        | `release-date`             |
| `upc`                   | text        | `upc`                      |
| `asin`                  | text        | `asin`                     |
| `epid`                  | text        | `epid`                     |
| `genre`                 | text        | `genre`                    |
| `retail_loose_buy`      | int         | `retail-loose-buy`         |
| `retail_loose_sell`     | int         | `retail-loose-sell`        |
| `retail_cib_buy`        | int         | `retail-cib-buy`           |
| `retail_cib_sell`       | int         | `retail-cib-sell`          |
| `retail_new_buy`        | int         | `retail-new-buy`           |
| `retail_new_sell`       | int         | `retail-new-sell`          |
| `sales_volume`          | int         | `sales-volume`             |
| `last_synced_at`        | timestamptz | set by sync job            |
| `updated_at`            | timestamptz | trigger                    |

Indexes:
- PK on `id`
- `CREATE INDEX ON pricecharting_catalog (category)`
- `CREATE INDEX ON pricecharting_catalog USING GIN (to_tsvector('simple', product_name))` for fuzzy name lookup
- `CREATE INDEX ON pricecharting_catalog (lower(product_name))` for exact-name lookup
- Optional composite `(category, lower(product_name))`

RLS: enable. No anon access. `GRANT SELECT` to `authenticated` (so client-side lookups work later if needed), `GRANT ALL` to `service_role` (sync job + edge functions). No insert/update/delete policies for users — only service role writes.

## 3. New edge function: `pricecharting-sync`

Path: `supabase/functions/pricecharting-sync/index.ts`. `verify_jwt = false` in `config.toml`.

Responsibilities:
- For each category in `["pokemon-cards", "magic-cards", "yugioh-cards", "onepiece-cards", "video-games"]`:
  - Build URL: `https://www.pricecharting.com/price-guide/download-custom?t=${PRICECHARTING_API_KEY}&category=${category}` (URL built in code from secret — never logged with token).
  - Stream the CSV response. Parse with a lightweight CSV parser (`npm:csv-parse@5/sync` via Deno `npm:` specifier, or hand-rolled streaming parser if memory is a concern — Pokemon CSV is ~50–80k rows).
  - Map each row: hyphenated header → snake_case column; coerce price fields to int (already pennies); coerce `release-date` to ISO date or null.
  - Batch upsert in chunks of 1000 via `supabase.from('pricecharting_catalog').upsert(rows, { onConflict: 'id' })`. Set `last_synced_at = now()` and `category` per row.
  - Track per-category counts: `fetched`, `parsed`, `upserted`, `errors`. `console.log` a summary per category and one final summary.
- Wrap each category in try/catch so one bad CSV doesn't kill the run. Return JSON `{ ok, results: [{category, count, ms, error?}] }`.

Failure modes handled:
- Missing `PRICECHARTING_API_KEY` → 500 with clear error.
- HTTP non-200 from PriceCharting → log + skip category.
- Malformed CSV row → log + skip row, continue.

## 4. Schedule

Use `pg_cron` + `pg_net` to invoke the function once daily at 04:00 UTC (off-peak; PriceCharting refreshes daily). Insert via the supabase insert tool (not migration, since URL + anon key are user-specific):

```sql
select cron.schedule(
  'pricecharting-sync-daily',
  '0 4 * * *',
  $$ select net.http_post(
       url:='https://<project>.supabase.co/functions/v1/pricecharting-sync',
       headers:='{"Content-Type":"application/json","apikey":"<anon>"}'::jsonb,
       body:='{}'::jsonb
     ); $$
);
```

## 5. Existing `_shared/pricecharting.ts`

Not changed in this prompt. A follow-up prompt will swap `fetchProduct` from the live `/api/product` call to a local `pricecharting_catalog` query. Keeping live-API path intact for now means nothing breaks while the catalog backfills on first run.

## 6. Memory

Update `mem://integration/pricecharting` to note: catalog table exists, daily sync job, lookups should prefer the local table going forward, CSV field → column mapping table.

## Open questions

1. **Categories** — listed `pokemon-cards, magic-cards, yugioh-cards, onepiece-cards, video-games`. Want to add `lorcana-cards`, `sports-cards`, anything else, or drop any?
2. **Schedule time** — 04:00 UTC OK, or different (PriceCharting recommends pulling after their nightly refresh, ~06:00 UTC)?
3. **CSV vs JSON-per-category** — PriceCharting also offers a JSON endpoint per-product but no bulk JSON. CSV is the only bulk option, confirming that's what you want.
