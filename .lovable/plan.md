

# Fix: Move referral_code out of profiles table

## Problem
The "Public can view public profiles" RLS policy exposes `referral_code` to anyone when `public_collection_enabled = true`. Since RLS is row-level (not column-level), we cannot selectively hide columns. This allows referral code harvesting and abuse.

## Solution
Move `referral_code` to a dedicated `referral_codes` table with strict RLS (owner-only read). This mirrors the approach we took for `email` — remove sensitive data from the publicly-readable profiles table entirely.

## Changes

### Migration
1. Create `referral_codes` table with columns: `user_id` (PK, references nothing to avoid auth.users FK issues), `code` (text, unique), `created_at`
2. Migrate existing codes: `INSERT INTO referral_codes SELECT id, referral_code, now() FROM profiles WHERE referral_code IS NOT NULL`
3. Add RLS: owner can SELECT their own code only
4. Move the `generate_referral_code` trigger to fire on `referral_codes` insert instead
5. Drop `referral_code` column from `profiles`
6. Create a new trigger on `auth.users` insert (or update `handle_new_user`) to also insert into `referral_codes`

### Frontend update
- **`src/components/ReferralCard.tsx`** — query `referral_codes` table instead of `profiles`

### Edge function update
- **`supabase/functions/redeem-referral/index.ts`** — look up referrer by code from `referral_codes` table (uses service role, so no RLS issue)

### No other changes needed
- `public_profiles` view already excludes `referral_code`
- Auth page just passes the code string to the edge function — no profile query involved

