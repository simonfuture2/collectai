

# Cross-App Account Linking: CollectAI ↔ AuthentiSeal via OAuth

Since you own both apps, the cleanest approach is to build a lightweight OAuth-style linking flow where CollectAI acts as a trusted partner that can pass authenticated user context + card data to AuthentiSeal.

## Architecture

```text
CollectAI                              AuthentiSeal
─────────                              ────────────
User clicks "Create Certificate"
  │
  ├─► CollectAI edge function           
  │   generates a signed token          
  │   (JWT with card data + user email) 
  │                                     
  ├─► Redirects to:                     
  │   authentiseal.xyz/create?token=XYZ 
  │                                     
  │                                     AuthentiSeal verifies token
  │                                     (shared secret between apps)
  │                                     Pre-fills form with card data
  │                                     Links/creates user by email
```

## Implementation Steps

### 1. Database: Store AuthentiSeal link status (optional, for UI)
- Add `authentiseal_linked` (boolean, default false) and `authentiseal_email` (text, nullable) to `profiles` table
- This is optional — the token-based flow works without it, but lets you show link status in the UI

### 2. New Edge Function: `generate-authentiseal-token`
- Accepts card data (name, category, set, year, condition, value range) + authenticated user context
- Creates a short-lived signed JWT (expires in 10 minutes) containing:
  - `user_email` (from auth)
  - `user_name` (from profile)
  - Card metadata fields
  - `source: "collectai"`
  - `iat` / `exp` timestamps
- Signs with a shared secret (stored as a secret in both apps)
- Returns the token

### 3. Update `AuthentiSealVerify.tsx`
- Replace `buildAuthentiSealCreateUrl` with an async function that calls the edge function
- Button click: call edge function → get token → redirect to `https://authentiseal.xyz/create?token={token}`
- Show loading state while generating token
- Fallback: if user is not logged in, use the current query-param approach

### 4. AuthentiSeal Side (separate project — guidance only)
- Add a token verification endpoint/logic on the `/create` page
- Verify JWT using the shared secret
- Extract card data and user email from the token
- Auto-fill the certificate form
- If user with that email exists, link the certificate; if not, prompt signup with pre-filled email

### 5. Add Shared Secret
- Add a secret `AUTHENTISEAL_SHARED_SECRET` to both projects
- Used for signing/verifying the cross-app JWT

## Files Changed (CollectAI side)

| File | Change |
|------|--------|
| `supabase/functions/generate-authentiseal-token/index.ts` | New edge function — signs JWT with card data |
| `src/components/AuthentiSealVerify.tsx` | Replace static URL builder with async token-based redirect |
| Migration (optional) | Add `authentiseal_linked` to profiles |

## Technical Notes
- The JWT approach is secure — tokens are short-lived and signed with a shared secret
- No need for full OAuth consent screens since you own both apps
- Card data travels in the token, not in URL query params (cleaner, no URL length limits)
- The AuthentiSeal side changes are outside this project — you'd implement them in the AuthentiSeal Lovable project separately

