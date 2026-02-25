

# CollectAI Monetization and Native Mobile App Plan

This is a large undertaking with two major workstreams: **payments/credits** and **native mobile app**. Here is the full plan broken into phases.

---

## Phase 1: Enable Stripe and Set Up Credit System

### 1a. Enable Stripe Integration
- Use the Stripe enablement tool to connect Stripe to the project. You will be prompted for your Stripe secret key.

### 1b. Create Database Tables
A migration will add three new tables:

```text
┌──────────────────────────┐
│  user_credits            │
├──────────────────────────┤
│  id (uuid, PK)           │
│  user_id (uuid, unique)  │
│  credits (int, default 3)│  ← Free tier starts at 3
│  plan (text, default     │
│        'free')           │  ← 'free' | 'pro'
│  stripe_customer_id      │
│  stripe_subscription_id  │
│  created_at, updated_at  │
└──────────────────────────┘

┌──────────────────────────┐
│  credit_transactions     │
├──────────────────────────┤
│  id (uuid, PK)           │
│  user_id (uuid)          │
│  amount (int)            │  ← positive = purchase, negative = usage
│  type (text)             │  ← 'scan' | 'purchase' | 'subscription' | 'free_monthly'
│  description (text)      │
│  created_at              │
└──────────────────────────┘
```

- RLS policies so users can only read/update their own credit records.
- A database trigger on `profiles` insert to auto-create a `user_credits` row with 3 free credits for every new user.

### 1c. Create Stripe Products and Prices
Using Stripe tools, create:
- **Pro Monthly** subscription: $9.99/month (unlimited scans, portfolio analytics, AuthentiSeal certificates)
- **10 Credit Pack**: $4.99 one-time
- **50 Credit Pack**: $19.99 one-time
- **100 Credit Pack**: $34.99 one-time

### 1d. Edge Functions for Payments
- **`create-checkout`**: Creates a Stripe Checkout Session for credit packs or Pro subscription. Returns the checkout URL.
- **`stripe-webhook`**: Handles Stripe webhook events (`checkout.session.completed`, `invoice.paid`, `customer.subscription.deleted`) to update `user_credits` table accordingly.

### 1e. Credit Enforcement in Scan Flow
- Modify the `analyze-card` edge function to check the user's credit balance or Pro status before processing. Deduct 1 credit per scan for non-Pro users. Return a 402 error if insufficient credits.
- Update `src/pages/Scan.tsx` to check credits before scanning and show an upgrade prompt if credits are exhausted.

---

## Phase 2: Pricing Page and Credit Management UI

### 2a. New Pricing Page (`src/pages/Pricing.tsx`)
- Display the three tiers: Free (3 scans/month), Credit Packs, Pro ($9.99/month)
- Feature comparison table
- "Subscribe" and "Buy Credits" buttons that call the `create-checkout` edge function
- Add route to `App.tsx`

### 2b. Credits Display
- Show remaining credits in the Dashboard header and Scan page
- Add a credit balance indicator component that appears on all authenticated pages
- Show "Pro" badge for subscribed users

### 2c. Upgrade Prompts
- Gate AuthentiSeal certificate creation behind Pro or 2-credit charge
- Gate Portfolio Analytics behind Pro plan
- Show contextual upgrade prompts when users hit these paywalls

### 2d. Landing Page Update
- Add a pricing section to the landing page with the three tiers
- Add "Start Free" and "Go Pro" CTAs

---

## Phase 3: Native Mobile App (Capacitor)

### 3a. Install Capacitor Dependencies
- Install `@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`, `@capacitor/android`
- Initialize with `npx cap init` using:
  - appId: `app.lovable.7e6b30f7ba0740d087d375a902ce186b`
  - appName: `collectai`

### 3b. Capacitor Configuration
- Create `capacitor.config.ts` with server URL pointing to the project preview for development hot-reload
- Configure for production builds

### 3c. App Store Preparation Notes
After the code is ready, you will need to:
1. Export the project to GitHub
2. `git pull`, `npm install`
3. `npx cap add ios` and `npx cap add android`
4. `npm run build && npx cap sync`
5. Open in Xcode / Android Studio to build and submit
6. You will need an Apple Developer account ($99/year) and Google Play Developer account ($25 one-time)

---

## Technical Details

### Credit Check Flow
```text
User taps "Analyze" 
  → Frontend checks user_credits table
  → If plan='pro' OR credits > 0: proceed
  → Else: show upgrade modal
  → analyze-card function double-checks server-side
  → On success: deduct 1 credit (if not Pro)
  → Log transaction in credit_transactions
```

### Stripe Webhook Flow
```text
Stripe event → stripe-webhook edge function
  → checkout.session.completed:
      - If subscription: set plan='pro', credits=unlimited
      - If credit pack: add credits to user_credits
  → customer.subscription.deleted:
      - Set plan='free'
  → invoice.paid (recurring):
      - Confirm pro status active
```

### Files to Create/Modify
- **New**: `src/pages/Pricing.tsx`, `src/components/CreditBalance.tsx`, `src/components/UpgradeModal.tsx`
- **New**: `supabase/functions/create-checkout/index.ts`, `supabase/functions/stripe-webhook/index.ts`
- **New**: Database migration for `user_credits` and `credit_transactions` tables
- **New**: `capacitor.config.ts`
- **Modify**: `src/App.tsx` (add Pricing route)
- **Modify**: `src/pages/Scan.tsx` (credit check before scan)
- **Modify**: `src/pages/Dashboard.tsx` (show credit balance)
- **Modify**: `src/pages/Landing.tsx` (add pricing section)
- **Modify**: `src/components/AuthentiSealVerify.tsx` (gate certificate creation)
- **Modify**: `supabase/functions/analyze-card/index.ts` (server-side credit enforcement)
- **Modify**: `supabase/config.toml` (add new function configs)

### Implementation Order
1. Enable Stripe (requires your Stripe secret key)
2. Database migration (credit tables)
3. Edge functions (checkout + webhook)
4. Credit enforcement in analyze-card
5. UI components (pricing page, credit balance, upgrade modal)
6. Update existing pages with credit checks and upgrade prompts
7. Capacitor setup for native mobile builds

