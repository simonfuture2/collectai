

# Fix: Remove email exposure from profiles table

## Problem
The RLS policy "Public can view public profiles" grants full row access (including `email`) to anyone when `public_collection_enabled = true`. Postgres RLS is row-level, not column-level, so we cannot restrict which columns are returned via policy alone.

## Solution
Drop the `email` column from the `profiles` table entirely.

**Why this is safe:**
- No client-side code reads `email` from `profiles` (verified via search)
- The admin edge function uses service-role client which bypasses RLS — but it reads `email` from profiles, so we need to handle that
- The `handle_new_user` trigger writes email to profiles, but if the column is gone it just needs updating
- The `public_profiles` view already excludes email
- User email is always available via `supabase.auth.getUser()` on the client and `auth.users` on the server

## Changes

### Migration
1. Drop the `email` column from `profiles` table
2. Update the `handle_new_user()` function to stop inserting `email`

### Edge function update
- **`supabase/functions/admin-data/index.ts`** — Instead of reading email from profiles, join/query `auth.admin.listUsers()` or use `supabaseAdmin.auth.admin.getUserById()` to get emails for admin display

## Impact
- Permanently eliminates email exposure risk — no policy adjustment needed
- `public_profiles` view unaffected (already excludes email)
- All existing client queries unaffected (none select email from profiles)

