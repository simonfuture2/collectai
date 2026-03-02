

## Admin Dashboard Enhancement Plan

### Current State
- The admin page (`/admin`) exists with basic read-only stats: total users, pro subscribers, credits in circulation, a users table, and recent transactions.
- The `admin-data` edge function supports `get_dashboard` action but has a broken `update_credits` action (re-parses consumed body).
- Auth uses `getClaims()` which may fail on Lovable Cloud (same ES256 issue seen in `check-subscription`).

### What to Build

#### 1. Fix & Expand the `admin-data` Edge Function
- Fix auth to use `getUser()` with anon key client (same pattern as the fixed `check-subscription`)
- Parse body once upfront, then route by `action`
- Add these actions:
  - **`update_credits`** — Set a user's credit balance to a specific value, log a transaction
  - **`update_plan`** — Change a user's plan (free/pro), log a transaction
  - **`add_credits`** — Add/deduct credits from a user, log a transaction
  - **`get_cards_stats`** — Return total cards count, cards per user stats
  - **`get_user_detail`** — Return full detail for a single user (credits, transactions, cards count, profile)
  - **`delete_user_data`** — Remove a user's cards, credits, transactions (for account cleanup)

#### 2. Enhance the Admin Frontend (`src/pages/Admin.tsx`)
- **More stats cards**: Total Cards Scanned, Revenue indicators (total credit purchases), Active subscriptions count
- **User management actions**: Click a user row to expand/see detail; buttons to adjust credits, change plan
- **Inline credit adjustment**: A modal/dialog to add/set credits for a user with a reason field
- **Plan toggle**: Quick button to upgrade/downgrade a user's plan
- **Transaction filters**: Filter by type (purchase, scan, bonus), date range
- **Cards overview**: Total cards in system, recent scans count
- **Tabbed layout**: Tabs for Users, Transactions, System Overview

#### 3. Additional Stats Queries in Edge Function
- Count total cards across all users
- Count scans (transactions of type `scan_deduction`)
- Revenue approximation from credit_transactions of type `credit_purchase`

### Technical Details

**Edge function auth fix** (critical): Replace `getClaims()` with the anon-key + `getUser()` pattern, then check admin role via service role client.

**Body parsing fix**: Read body once at the top:
```
const body = await req.json();
const { action, ...params } = body;
```

**New admin actions** will all use the service-role `adminClient` for DB operations after verifying admin status.

**Frontend** will use `supabase.functions.invoke("admin-data", { body: { action, ...params } })` for all operations, keeping all admin logic server-side.

