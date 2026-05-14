## Goal
Eliminate the `USING (true)` public read on `public.pack_rips` without breaking the share-by-token flow. Move public reads behind a service-role edge function that requires a valid `share_token`.

## 1. Database migration
New migration file `supabase/migrations/<ts>_lock_pack_rips_public_read.sql`:
- `DROP POLICY IF EXISTS "Anyone can view pack rips by share token" ON public.pack_rips;` (idempotent — earlier migration may already have dropped it).
- Leave `"Users can view their own pack rips"` (owner SELECT) and all owner INSERT/UPDATE/DELETE policies untouched.
- No other table changes.

Result: anon/authenticated can no longer SELECT another user's pack rip via PostgREST. Owners keep dashboard access.

## 2. New edge function `get-shared-pack-rip`
File: `supabase/functions/get-shared-pack-rip/index.ts`. Public (no JWT).

Behavior:
- `OPTIONS` → CORS preflight using `npm:@supabase/supabase-js@2/cors`.
- `POST` only; reject other methods with 405.
- Parse JSON body; validate with zod: `share_token: string, length 1–64, /^[A-Za-z0-9_-]+$/`. On failure → 400 `{ error: "Invalid share_token" }`.
- Build service-role client from `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (no auth header forwarding).
- `supabase.from("pack_rips").select("id, set_name, retail_cost, pulls, total_value, best_pull_name, best_pull_value, created_at, share_token").eq("share_token", token).maybeSingle()`.
- If no row → 404 `{ error: "Not found" }`. If db error → 500 `{ error: "Internal server error" }` (no leak).
- Otherwise → 200 with the row JSON.
- All responses include `corsHeaders` + `Content-Type: application/json`.

Add `[functions.get-shared-pack-rip]\nverify_jwt = false` to `supabase/config.toml`.

## 3. Frontend audit
Search confirms only one consumer of `pack_rips` in `src/`: `src/pages/PackRip.tsx` (the owner-side save flow). It already uses authenticated `supabase.from("pack_rips").insert(...)` — that path stays as-is (RLS owner policy covers it).

No existing page reads pack rips by share token, so there is **no current frontend code to migrate** to `functions.invoke("get-shared-pack-rip", ...)`. The new edge function is in place for any future public share viewer (e.g. `/pack/:token`); when that page is built, it must use:
```ts
const { data, error } = await supabase.functions.invoke("get-shared-pack-rip", {
  body: { share_token },
});
```
(This will be called out in the closing message so it isn't forgotten.)

## 4. Verification
- Deploy the new edge function automatically.
- Curl test: POST with a valid token returns row; POST with bogus token returns 404; missing/invalid body returns 400.
- Confirm owner dashboard (`PackRip.tsx`) still saves & redirects (RLS unchanged for owner).
- Re-run security scan; the `pack_rips` public-read finding should clear.

## Out of scope
- Building a public `/pack/:token` viewer page (none exists today).
- Touching any other RLS policy.
