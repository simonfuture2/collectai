# Fix sign-up (Google, email and Sign in with Lovable)

## What's wrong
Every new account fails at the moment it's created. When someone signs up, the app creates their profile, and a stray rule on the profiles table then tries to give that profile a referral code. Profiles don't have a referral-code field, so the whole sign-up is rolled back with an error. That's why nothing happens on Google or email sign-up, and why provider sign-in errors. Existing users can still sign in; only brand-new accounts are blocked.

Referral codes are already created correctly in their own place during sign-up, so the stray rule isn't needed.

## Fix
1. Remove the stray referral-code rule from the profiles table (keep the correct one on the referral codes table).
2. Add a small database test that creates a fake new user inside a rolled-back transaction and confirms a profile and referral code are both made.
3. Check sign-up end to end in a test browser: email sign-up shows "check your email to confirm", and the Google button opens Google without errors.
4. Check the sign-in logs show no more errors.

## Technical details
- Migration: `DROP TRIGGER IF EXISTS on_profile_created_generate_referral ON public.profiles;`
- `handle_new_user()` on `auth.users` already inserts `profiles` and `referral_codes`; `generate_referral_code_trigger` on `referral_codes` fills `code`.
- Auth log error: `record "new" has no field "code"` on the id_token (Google) grant.
