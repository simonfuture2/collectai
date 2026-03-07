

# Security Audit & Recommendations for CollectAI

## Findings Summary

| # | Severity | Issue | Location |
|---|----------|-------|----------|
| 1 | **CRITICAL** | Public profiles expose email addresses | `profiles` table RLS |
| 2 | **CRITICAL** | Password reset redirects to `/auth` instead of a dedicated reset page | `Auth.tsx` line 63 |
| 3 | **HIGH** | `user_credits` DELETE RLS missing but table has Stripe data | `user_credits` RLS |
| 4 | **HIGH** | Leaked password protection disabled | Auth config |
| 5 | **HIGH** | `DeleteAccount` page deletes data client-side, bypasses RLS for some tables | `DeleteAccount.tsx` |
| 6 | **HIGH** | Race condition in credit deduction (analyze-card) — concurrent requests can double-spend | `analyze-card/index.ts` |
| 7 | **MEDIUM** | `send-push` uses service role client to call `auth.getUser()` instead of anon key client | `send-push/index.ts` |
| 8 | **MEDIUM** | `customer-portal` uses service role to validate user token (should use anon key per dual-client pattern) | `customer-portal/index.ts` |
| 9 | **MEDIUM** | Users cannot read their own role from `user_roles` (breaks `useAdmin` hook for non-admins without the `is_admin` function) | `user_roles` RLS |
| 10 | **LOW** | `Access-Control-Allow-Origin: *` on all edge functions | All edge functions |
| 11 | **LOW** | No `/reset-password` page exists — password reset link logs user in without forcing password change | Missing route |
| 12 | **LOW** | `create-checkout` missing `verify_jwt = false` in config.toml but uses manual auth | `supabase/config.toml` |

---

## Detailed Plan

### 1. Fix public profile email exposure (CRITICAL)
**Problem:** The `profiles` RLS policy "Anyone can view public profiles" exposes all columns including `email` when `public_collection_enabled = true`.
**Fix:** Create a database view `public_profiles` that excludes `email`, or create a restrictive RLS policy. Best approach: modify the public profiles SELECT policy to only allow access to non-sensitive columns via a security definer function, OR update the `PublicCollection.tsx` page to use an edge function that returns only safe fields.

**Migration:** Add a `public_profiles` view:
```sql
CREATE VIEW public.public_profiles AS
SELECT id, display_name, avatar_url, public_collection_slug, public_collection_enabled
FROM public.profiles
WHERE public_collection_enabled = true;
```
Then update `PublicCollection.tsx` to query the view instead of `profiles` directly.

### 2. Add proper password reset flow (CRITICAL)
**Problem:** `resetPasswordForEmail` redirects to `/auth` (line 63). There is no `/reset-password` route. Users clicking the reset link get auto-logged in without actually resetting their password.
**Fix:**
- Create `/reset-password` page that checks for `type=recovery` hash param
- Shows a "set new password" form calling `supabase.auth.updateUser({ password })`
- Update `redirectTo` in Auth.tsx to `${window.location.origin}/reset-password`
- Add route to `App.tsx`

### 3. Enable leaked password protection (HIGH)
**Problem:** HIBP check is disabled, allowing users to sign up with known-compromised passwords.
**Fix:** Use `configure_auth` tool to enable leaked password protection.

### 4. Fix credit deduction race condition (HIGH)
**Problem:** In `analyze-card`, credits are checked at the start and deducted at the end. Two concurrent requests can both pass the check and only deduct once.
**Fix:** Use an atomic SQL operation: `UPDATE user_credits SET credits = credits - 1 WHERE user_id = $1 AND credits > 0 RETURNING credits`. Create a database function `deduct_credit(user_id uuid)` that atomically checks and deducts.

### 5. Move account deletion to an edge function (HIGH)
**Problem:** `DeleteAccount.tsx` runs client-side deletes. Some tables (like `user_credits`, `credit_transactions`) have restrictive DELETE policies that will silently fail. The user's auth account is never actually deleted.
**Fix:** Create a `delete-account` edge function using service role that:
- Deletes all user data across tables
- Calls `supabase.auth.admin.deleteUser(userId)` to actually remove the auth account
- Returns success to client which then redirects

### 6. Fix `send-push` auth pattern (MEDIUM)
**Problem:** Uses service role client to call `auth.getUser()`. Should use anon key client with user's auth header (dual-client pattern).
**Fix:** Split into anon key client for identity verification, service role client for DB ops.

### 7. Fix `customer-portal` auth pattern (MEDIUM)
**Problem:** Same as #6 — uses service role to validate user token.
**Fix:** Apply dual-client pattern.

### 8. Add user self-read policy on `user_roles` (MEDIUM)
**Problem:** Users can't read their own role. The `useAdmin` hook works only because it uses the `is_admin()` security definer function as a workaround, but direct queries fail.
**Fix:** Add RLS policy:
```sql
CREATE POLICY "Users can view their own roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (auth.uid() = user_id);
```

### 9. Restrict CORS origins (LOW)
**Problem:** All edge functions use `Access-Control-Allow-Origin: *`.
**Fix:** For user-facing functions (not public API), restrict to `https://collectai.lovable.app` and preview URLs. Keep `*` only for the public API endpoints (`collectai-grade`, `collectai-identify`, `collectai-price`).

### 10. Add `create-checkout` and `customer-portal` to config.toml (LOW)
**Problem:** These functions aren't listed in `config.toml` with `verify_jwt = false`, but they do manual auth. They may default to JWT verification which could cause issues with Lovable Cloud ES256 tokens.
**Fix:** Add entries to `supabase/config.toml`.

---

## Implementation Priority

1. Password reset page + fix redirect (Critical, quick win)
2. Public profiles email exposure fix (Critical)
3. Credit deduction atomicity (High, prevents financial loss)
4. Account deletion edge function (High)
5. Enable leaked password protection (High, one config change)
6. Edge function auth pattern fixes (Medium)
7. `user_roles` self-read policy (Medium)
8. CORS + config.toml cleanup (Low)

**Estimated scope:** ~8 files to create/modify, 2 database migrations, 1 auth config change.

