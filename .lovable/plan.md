

# Switch Stripe to Live Mode

## What needs to happen

You need to update **3 things** to go live:

### 1. Update `STRIPE_SECRET_KEY` secret
Replace the current test key (`sk_test_...`) with your live key (`sk_live_...`) from your Stripe Dashboard → Developers → API keys.

### 2. Update `STRIPE_WEBHOOK_SECRET` secret
Create a new webhook endpoint in Stripe's live mode dashboard pointing to:
`https://irncxwszrawrndsdaqel.supabase.co/functions/v1/stripe-webhook`

Then use the new webhook signing secret (`whsec_...`) from that endpoint.

### 3. Update Price IDs in `src/lib/stripe-config.ts`
Products/prices are separate between test and live mode. You need to create the same 4 products in Stripe's live dashboard and replace the price IDs in the config file.

## Steps I will take

1. Prompt you to enter the new live `STRIPE_SECRET_KEY`
2. Prompt you to enter the new live `STRIPE_WEBHOOK_SECRET`
3. Ask you for your 4 new live-mode price IDs (Pro, 10-pack, 50-pack, 100-pack) and update `src/lib/stripe-config.ts`

