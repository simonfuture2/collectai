

# Admin Dashboard / Portal

## Current State
There is no admin dashboard, admin role system, or management UI anywhere in the codebase. User and subscription data lives in the `user_credits` and `credit_transactions` tables, but there's no way to view or manage them from within the app.

## Proposed Plan

### 1. Database: Add Admin Role

Create a migration to add an `is_admin` column to the existing user data, or create a dedicated `admin_users` table referencing `auth.users`. The simpler approach is a `user_roles` table:

```sql
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: only admins can read this table
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read all roles"
  ON public.user_roles FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin')
  );
```

Seed your own user as the first admin manually.

### 2. Backend: Admin Check Edge Function

Create a `check-admin` edge function (or add admin status to the existing `check-subscription` function) that verifies the calling user has `role = 'admin'` in `user_roles`.

### 3. Frontend: Admin Dashboard Page

Create `src/pages/Admin.tsx` with the following sections:

- **Users Table**: Lists all users from `user_credits` — shows email, plan (free/pro), credits balance, subscription status, and join date. Supports search and pagination.
- **Subscriptions Overview**: Summary cards showing total Pro subscribers, total free users, total credits in circulation.
- **Credit Transactions Log**: Filterable table of `credit_transactions` — type, amount, user, timestamp.
- **Quick Actions**: Manually adjust a user's credits, upgrade/downgrade a user's plan.

### 4. Routing & Navigation

- Add `/admin` route to `App.tsx` (protected — redirects non-admins)
- Add a conditional "Admin" link in the dashboard navigation for admin users
- No footer link (admins-only)

### 5. Security

- All admin queries go through an edge function or use RLS policies that check `user_roles.role = 'admin'`
- The admin page checks role on mount and redirects unauthorized users to `/dashboard`

## Files Changed
- **New**: `src/pages/Admin.tsx` (main dashboard)
- **New**: `src/hooks/use-admin.ts` (admin role check hook)
- **Modified**: `src/App.tsx` (add route)
- **Modified**: `src/pages/Dashboard.tsx` (conditional admin link)
- **Migration**: `user_roles` table + RLS policies
- **Optional**: Edge function for admin-only data queries

## Technical Notes
- Uses existing `user_credits` and `credit_transactions` tables for data
- No new dependencies needed — uses existing Table, Card, and Badge UI components
- Stripe subscription details can be cross-referenced via `stripe_customer_id`

