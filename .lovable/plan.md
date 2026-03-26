

# Fix: Harden user_credits table INSERT restriction

## Current State
The `user_credits` table has RLS enabled with **no INSERT policy for regular users**, which means Postgres already denies inserts by default. However, making this explicit is best practice for auditability.

## Change
One database migration to add an explicit INSERT policy that only allows the service role (via the `handle_new_user_credits` trigger) to insert rows:

```sql
CREATE POLICY "Only service role can insert credits"
  ON public.user_credits FOR INSERT
  TO authenticated
  WITH CHECK (false);
```

This explicitly denies all authenticated user inserts. The `handle_new_user_credits` trigger runs as `SECURITY DEFINER` and bypasses RLS, so new user signup is unaffected. Admin operations use the service role client, also unaffected.

## No frontend or edge function changes needed
All credit mutations already go through edge functions using the service role key.

