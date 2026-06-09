## Goal

Import the uploaded `price-guide_pokemon.csv` (87,955 rows) into the existing `public.pricecharting_catalog` table so card lookups can hit the local catalog immediately, without waiting for the next scheduled `pricecharting-sync` run.

The table, indexes, RLS, and the hybrid lookup in `_shared/pricecharting.ts` (local-first, API fallback) are already in place from the earlier plan — no schema or app code changes needed.

## Steps

1. **Copy upload to sandbox temp**
   - `code--copy user-uploads://price-guide_pokemon.csv /tmp/price-guide_pokemon.csv`

2. **Transform CSV → catalog-shaped CSV** (Python via `code--exec`)
   - Read with `csv.DictReader`.
   - Map hyphenated CSV headers → snake_case columns matching `pricecharting_catalog` (same mapping the sync function uses).
   - Drop columns the table does not have (`gamestop-price`, `gamestop-trade-price`, `tcg-id`).
   - Strip `$` and convert all price fields to **integer cents** (e.g. `$43.38` → `4338`); empty → `NULL`.
   - Coerce `release-date` → ISO date or `NULL`; `sales_volume` → int; `id` → bigint.
   - Add constant `category = 'pokemon-cards'` and `last_synced_at = now()` to every row.
   - Skip rows missing `id` or `product_name`.
   - Write to `/tmp/pricecharting_pokemon.csv` with a header row matching destination columns.

3. **Load into Postgres** (`code--exec` with `psql`)
   - Stage into a `TEMP` table, then `INSERT … ON CONFLICT (id) DO UPDATE` so re-running is idempotent and matches the sync function's upsert behavior:
     ```sql
     CREATE TEMP TABLE _pc_stage (LIKE public.pricecharting_catalog INCLUDING DEFAULTS);
     \copy _pc_stage (id, product_name, console_name, category, loose_price, cib_price, new_price, graded_price, box_only_price, manual_only_price, bgs_10_price, condition_17_price, condition_18_price, release_date, upc, asin, epid, genre, retail_loose_buy, retail_loose_sell, retail_cib_buy, retail_cib_sell, retail_new_buy, retail_new_sell, sales_volume, last_synced_at) FROM '/tmp/pricecharting_pokemon.csv' WITH (FORMAT csv, HEADER true, NULL '');
     INSERT INTO public.pricecharting_catalog SELECT * FROM _pc_stage
       ON CONFLICT (id) DO UPDATE SET
         product_name = EXCLUDED.product_name,
         console_name = EXCLUDED.console_name,
         category = EXCLUDED.category,
         loose_price = EXCLUDED.loose_price,
         cib_price = EXCLUDED.cib_price,
         new_price = EXCLUDED.new_price,
         graded_price = EXCLUDED.graded_price,
         box_only_price = EXCLUDED.box_only_price,
         manual_only_price = EXCLUDED.manual_only_price,
         bgs_10_price = EXCLUDED.bgs_10_price,
         condition_17_price = EXCLUDED.condition_17_price,
         condition_18_price = EXCLUDED.condition_18_price,
         release_date = EXCLUDED.release_date,
         upc = EXCLUDED.upc,
         asin = EXCLUDED.asin,
         epid = EXCLUDED.epid,
         genre = EXCLUDED.genre,
         retail_loose_buy = EXCLUDED.retail_loose_buy,
         retail_loose_sell = EXCLUDED.retail_loose_sell,
         retail_cib_buy = EXCLUDED.retail_cib_buy,
         retail_cib_sell = EXCLUDED.retail_cib_sell,
         retail_new_buy = EXCLUDED.retail_new_buy,
         retail_new_sell = EXCLUDED.retail_new_sell,
         sales_volume = EXCLUDED.sales_volume,
         last_synced_at = EXCLUDED.last_synced_at;
     ```

4. **Verify**
   - `SELECT count(*), min(release_date), max(release_date) FROM pricecharting_catalog WHERE category = 'pokemon-cards';`
   - Spot-check a known row (e.g. `id = 7569343` Charizard #6) and confirm `loose_price = 4338` (cents).

5. **No code changes**
   - `_shared/pricecharting.ts` already prefers the local catalog for non-sports categories, so card lookups will start using these rows immediately.
   - The daily `pricecharting-sync` cron will keep them fresh going forward.

## Notes / open question

- "AI knowledge base" — the catalog table *is* the knowledge source the AI lookup uses (via `getPriceChartingData`). No separate vector store or prompt embedding is needed; the analyze-card pipeline already queries this table. If you instead meant attaching the CSV to a docs/RAG store, let me know and I'll adjust.
- Import will likely take ~30–60s for 88k rows. Safe to re-run; upsert is idempotent.
