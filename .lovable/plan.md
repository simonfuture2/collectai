

# Security & Safety Audit for CollectAI

## Critical Issues Found (Must Fix)

### 1. User emails exposed publicly via profiles RLS policy
**Risk**: Lawsuit-worthy. The "Anyone can view public profiles" SELECT policy exposes `email` and `referral_code` to unauthenticated users when `public_collection_enabled = true`. This violates privacy laws (GDPR, CCPA).

**Fix**: Replace the broad public profiles SELECT policy with one that only allows access to safe columns, or enforce that public queries go through the existing `public_profiles` view (which already excludes email).

**Migration**:
- DROP the "Anyone can view public profiles" policy
- CREATE a new policy that restricts public SELECT to only `id`, `display_name`, `avatar_url`, `public_collection_slug`, `public_collection_enabled`

### 2. Users can self-create credit records (payment bypass)
**Risk**: Any authenticated user can INSERT into `user_credits` with arbitrary `credits` and `plan` values, completely bypassing Stripe.

**Fix**: DROP the "Users can insert their own credits" INSERT policy. Credit creation is already handled by the `handle_new_user_credits` trigger (SECURITY DEFINER), so no client INSERT is needed.

### 3. Leaked Password Protection disabled
**Risk**: Users can sign up with passwords known to be compromised in data breaches.

**Fix**: This must be enabled manually in the Cloud dashboard under Authentication Settings. No code change — I'll provide instructions.

---

## Warning-Level Issues (Should Fix)

### 4. Old cards store full public URLs instead of file paths
Some older cards have `image_url` set to full `https://...supabase.co/storage/v1/object/public/card-images/...` URLs from when the bucket was public. These URLs may still work if cached, but the bucket is now private. No action needed beyond awareness — new cards already use file paths.

### 5. Quick-scan CORS is wildcard (`*`)
The `quick-scan` function allows requests from any origin. This is acceptable for a public free-scan feature, but if you want to restrict abuse, you could limit origins.

### 6. No rate limiting on `analyze-card`
The `quick-scan` has IP-based rate limiting (3/hour), but `analyze-card` (authenticated scan) has no rate limit. A malicious user could burn through API costs rapidly.

**Fix**: Add a per-user scan limit (e.g., max 10 scans per hour) checked in `analyze-card` before calling Claude.

---

## Recommendations for "Most Secured AI Scanner"

### 7. Stronger AI disclaimer placement
You already have `AIDisclaimer` on card detail pages. Consider adding it:
- On the scan results screen immediately after values appear
- On shared/public card pages
- In email notifications if you send value alerts

### 8. Terms of Service — liability limitation
Ensure your Terms page explicitly states:
- AI valuations are estimates, not appraisals
- CollectAI is not liable for financial decisions based on AI grades/values
- Users should seek professional grading for high-value items

### 9. Input sanitization on card notes
Users can write free-text `notes` on cards. While these aren't rendered with `dangerouslySetInnerHTML` (confirmed safe), ensure any future rendering of user-generated content uses sanitization.

### 10. Referral code abuse prevention
Currently no limit on referral redemptions. A user could create multiple accounts to farm credits. Consider adding a check for duplicate emails or IP-based limits.

---

## Implementation Plan

### Migration 1: Fix public email exposure
```sql
DROP POLICY "Anyone can view public profiles" ON profiles;
CREATE POLICY "Public can view safe profile fields" ON profiles
  FOR SELECT TO anon, authenticated
  USING (public_collection_enabled = true);
```
Then update frontend queries for public collections to SELECT only `id, display_name, avatar_url, public_collection_slug` (never `email`).

### Migration 2: Remove user_credits INSERT policy
```sql
DROP POLICY "Users can insert their own credits" ON user_credits;
```

### Code change: Rate limit analyze-card
Add a simple per-user hourly scan counter in the `analyze-card` edge function, checking `credit_transactions` count in the last hour before proceeding.

### Code change: Restrict public profile queries
Update `PublicCollection.tsx` and any shared card pages to only select safe columns from profiles.

### Manual step: Enable Leaked Password Protection
Go to Cloud dashboard → Authentication Settings → Enable "Leaked Password Protection (HIBP)"

---

## Summary

| # | Issue | Severity | Type |
|---|-------|----------|------|
| 1 | Email exposed publicly | CRITICAL | DB Migration |
| 2 | Credit self-insert bypass | CRITICAL | DB Migration |
| 3 | Leaked password protection | WARN | Manual config |
| 4 | No rate limit on analyze-card | MEDIUM | Edge function code |
| 5 | Stronger disclaimers | LOW | Frontend code |

Fixes 1-2 are database migrations. Fix 3 is a dashboard toggle. Fix 4 is an edge function update. Fix 5 is minor frontend additions.

