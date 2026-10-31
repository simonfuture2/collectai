# Price Check: database groundwork (one migration, no screens)

## What it adds
1. **On/off switch for Price Check.** A new settings table holds `price_check_enabled` (starts off). Each user's credits record gets `price_check_beta` (starts off). A helper answers "can this person use Price Check?": yes for admins, yes for beta users, and yes for everyone once the switch is on. Only admins or the backend can change the switch or a user's beta flag.
2. **Price check history.** A new table stores each check. Users can see and delete only their own checks. Only the backend can add them.
3. **Cards** get four new fields: `analysis_depth` (`price_only` or `full`, default `full`), `pricecharting_id`, `pc_prices`, `pc_synced_at`.
4. **Price catalog** gets ten more price columns (condition 9, 10, 13–16, 19–22) and two indexes so name searches are fast.
5. **Live price cache.** Stores answers from PriceCharting, keyed by product, and can be looked up by search text.
6. **Call spacing.** A one-row timer plus a function that tells the backend how long to wait, so calls to PriceCharting stay at least 1.1 seconds apart.

Visitors who aren't signed in can't reach any of the new tables.

## Technical details
- `CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;`
- `public.app_settings(key text pk, value jsonb not null, updated_at timestamptz default now())`. Seed `('price_check_enabled', 'false')` as part of the schema change. Grants: SELECT to authenticated, ALL to service_role. RLS: authenticated users can read; only `is_admin(auth.uid())` can insert, update or delete.
- `user_credits.price_check_beta boolean not null default false`. Extend `guard_beta_fields()` so only admins or the service role can change it.
- `public.can_use_price_check(_uid uuid) returns boolean`: STABLE, SECURITY DEFINER. Returns true if the flag is on, or `is_admin(_uid)`, or the user's `price_check_beta`. Execute is granted to authenticated and service_role.
- `public.price_checks`: columns as specified. `source` has a CHECK for `catalog`, `api` or `cache`. Indexes on `(user_id, created_at desc)`. Grants: SELECT and DELETE to authenticated, ALL to service_role. Policies: select and delete where `user_id = auth.uid()`. There is no insert policy for users. No foreign keys to auth.users.
- `cards`: add the columns, with `CHECK (analysis_depth in ('price_only','full'))`. Existing rows get `full`.
- `pricecharting_catalog`: add the 10 integer columns, `GIN (product_name gin_trgm_ops)`, and `btree (category, console_name)`.
- `public.pricecharting_live_cache(product_id bigint pk, query text, payload jsonb not null, fetched_at timestamptz not null default now())` plus `UNIQUE INDEX ON (lower(query))`. Rows without a query are allowed. Note: because `product_id` is the key, cached search results must be saved under a product id, as you specified. Grants and RLS: service_role only.
- `public.pricecharting_api_throttle(id int pk default 1 check (id = 1), next_allowed_at timestamptz not null default now())`, seeded with one row. service_role only.
- `pc_acquire_slot() returns integer`, SECURITY DEFINER, `search_path=public`. It runs `SELECT ... FOR UPDATE`, computes `slot = greatest(now(), next_allowed_at)`, sets `next_allowed_at = slot + 1100 ms`, and returns `ceil(ms(slot - now()))`. Execute is revoked from public, anon and authenticated and granted to service_role.
- Regenerate the app's database types afterwards. No screen or edge-function changes.
