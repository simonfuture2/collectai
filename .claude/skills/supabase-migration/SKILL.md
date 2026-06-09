---
name: supabase-migration
description: Write, review, and apply Supabase database migrations and RLS policies for the collectai app. Use when adding or altering tables/columns, writing row-level-security policies, creating database functions or triggers, or reviewing a schema change before it ships.
---

# Supabase Migration Helper

Use this skill whenever a task touches the Postgres schema, RLS policies, or
database functions in a Supabase project (e.g. `collectai-deploy`).

## 1. Locate the migrations directory

Migrations live in `supabase/migrations/`. Inspect existing files first to match
conventions before writing anything new:

```
ls supabase/migrations/
```

Lovable/Supabase name files with a UTC timestamp prefix
(`YYYYMMDDHHMMSS_<slug>.sql`). Follow the existing naming pattern in the repo.

## 2. Write the migration

Rules:

- **One logical change per migration file.** Don't bundle unrelated schema edits.
- **Always make migrations idempotent where possible** — use `if not exists` /
  `if exists` and `create or replace` so re-runs are safe.
- **Never edit a migration that has already been applied to a shared/remote
  database.** Add a new forward migration instead.
- Wrap multi-statement changes so they apply atomically; Postgres runs each file
  in a transaction by default.

Example skeleton:

```sql
-- 20260609120000_add_collections_visibility.sql

alter table public.collections
  add column if not exists is_public boolean not null default false;

create index if not exists collections_is_public_idx
  on public.collections (is_public);
```

## 3. Row-Level Security (REQUIRES EXTRA CARE)

Any change here is security-sensitive — call it out loudly in summaries and PRs.

- Enable RLS explicitly on every new table:
  `alter table public.<t> enable row level security;`
- A table with RLS enabled and **no policies denies all access** — confirm the
  intended policies exist.
- Scope policies to the right role (`authenticated`, `anon`, `service_role`) and
  use `auth.uid()` to restrict rows to their owner. Example:

```sql
alter table public.collections enable row level security;

create policy "Owners can read their collections"
  on public.collections
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Owners can modify their collections"
  on public.collections
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

- For `insert`/`update`, set **`with check`** (not just `using`) or rows can be
  written that violate the policy on read.
- Prefer `security invoker` functions; only use `security definer` when required,
  and always pin `set search_path = ''` (or an explicit schema) to avoid
  search-path hijacking.

## 4. Review checklist (run before applying or opening a PR)

- [ ] File timestamp/name matches repo convention and is newer than the latest.
- [ ] Statements are idempotent (`if (not) exists`, `create or replace`).
- [ ] RLS enabled on every new table; policies cover select/insert/update/delete
      as intended; `with check` present on write policies.
- [ ] No `security definer` function without a pinned `search_path`.
- [ ] Foreign keys have an `on delete` behavior chosen deliberately.
- [ ] No destructive change (`drop`, `alter ... drop column`, type narrowing)
      without an explicit, confirmed reason — flag these to the user.

## 5. Apply

Only apply when the user asks. Prefer the Supabase CLI:

```
supabase db diff   # inspect what will change
supabase migration up   # apply locally
```

For remote/production, confirm with the user first and use `supabase db push`.

## Reporting

When summarizing the change (e.g. in a PR), explicitly state:
- Which tables/columns were added or altered.
- **Any RLS or auth policy change** (these need extra review).
- Whether the migration is reversible and whether it was tested.
