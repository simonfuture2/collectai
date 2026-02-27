

## Plan: Manually fulfill the missed credit purchase

Since the Stripe webhook wasn't listening for `checkout.session.completed` when the payment occurred, the credits were never added. The simplest fix is to manually add the 10 credits directly in the database.

### Steps

1. **Run a database query** to add 10 credits to user `72f0adfb-d41e-4fa6-8d67-078c10c4091a` (the logged-in user visible in edge function logs), updating their `user_credits` row from 3 to 13.

2. **Insert a `credit_transactions` record** to log this manual fulfillment for audit purposes.

3. **Verify** by checking the `check-subscription` endpoint returns the updated credit count.

### Technical Details

SQL migration to execute:
```sql
UPDATE public.user_credits 
SET credits = credits + 10 
WHERE user_id = '72f0adfb-d41e-4fa6-8d67-078c10c4091a';

INSERT INTO public.credit_transactions (user_id, type, amount, description)
VALUES ('72f0adfb-d41e-4fa6-8d67-078c10c4091a', 'credit_purchase', 10, 'Manual fulfillment: 10 Credit Pack ($9.99) - webhook missed');
```

After this, refreshing the dashboard should show 13 credits. Going forward, the webhook is now configured correctly and future purchases will be fulfilled automatically.

