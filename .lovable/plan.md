

# Fix: Refund-on-abandon + Add credits to user

## Problem
Credits are deducted server-side after analysis completes, but if the user closes the browser before the client receives the response, the auto-save never runs. The user loses a credit with no card in their collection. This happened twice to user `w3mctmobile@gmail.com`.

## Changes

### 1. Add 2 credits back to the affected user
- Use the `admin-data` edge function's `add_credits` action to restore 2 credits to the user (`w3mctmobile@gmail.com` / user ID `8a95e2c3-a27c-4eaa-955e-6c2243b391ad` from logs).

### 2. Move credit deduction to happen AFTER the card is saved (not after analysis)
**File: `supabase/functions/analyze-card/index.ts`**
- Move credit deduction from the end of the edge function to a new approach: **don't deduct in the edge function at all**. Instead, return a `pendingDeduction: true` flag in the response.

**File: `src/pages/Scan.tsx`**
- After the auto-save succeeds (card inserted into DB), call a new lightweight edge function or RPC to deduct the credit.
- This way, if the user abandons mid-scan, no credit is lost because deduction only happens after the card is persisted.

**However**, this creates a new risk: the user could intercept the response and skip the deduction call. A safer approach:

### 2 (revised). Save the card server-side in the edge function, then deduct
**File: `supabase/functions/analyze-card/index.ts`**
- After analysis completes, insert the card into the `cards` table and `price_history` directly in the edge function using the service-role client, **then** deduct the credit.
- Return the saved card ID to the client.
- This guarantees: credit deducted = card saved. Both happen atomically server-side.

**File: `src/pages/Scan.tsx`**
- Remove the client-side auto-save logic (the `supabase.from("cards").insert(...)` block).
- After `analyze-card` returns, just navigate to `/card/${data.cardId}`.
- Keep a fallback: if `data.cardId` is missing (old response format), fall back to client-side save.

### 3. Handle duplicate scan prevention
- In the edge function, before inserting, check if a card with the same `image_url` (file path) already exists for this user. If so, skip insert and deduction, return the existing card ID.

## Files to edit
1. `supabase/functions/analyze-card/index.ts` — save card + deduct credit server-side
2. `src/pages/Scan.tsx` — remove client-side save, navigate to returned card ID

## Technical details
- The edge function already has a `supabaseAdmin` (service-role) client, so it can insert into `cards` and `price_history` tables bypassing RLS.
- The uploaded image file path is passed in the request body; we'll use it as `image_url`.
- Credit deduction stays atomic via `deduct_credit` RPC, but now happens right after the card insert succeeds.

