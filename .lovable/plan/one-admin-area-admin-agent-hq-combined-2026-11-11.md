# One admin area: Admin + Agent HQ combined

Rep pages and the public site stay as they are. No table or data is deleted; old tables are kept read-only.

## 1. Admin shell at /admin
- Left sidebar (shrinks to icons on desktop, slide-out menu on phones) with groups:
  - Overview
  - Outreach: Inbox (approval queue + replies), Leads, Sequences & drips, Broadcasts, Templates, Channels
  - Users: Users, Transactions, Beta, Beta audit, Admins
  - Growth: Funnel, Results, Partners, Videos, Push
  - Data: Match accuracy, Price Check Lab, PriceCharting data, ID bake-off
- Every section has its own bookmarkable link (/admin#inbox, /admin#users, ...). /admin/agent redirects to /admin#inbox; /admin/price-check-lab and /admin/id-bakeoff stay working and also open inside the shell.
- Existing sections are reused as-is (Agent HQ queue, leads, channels, results; Admin's users, transactions, campaigns, beta, admins, etc.). Admin access checks stay exactly as they are today.
- "Partners" lists leads from the partner form; "Sequences & drips" shows the existing drip queue; "Broadcasts" is the current "Send to everyone" area; "Templates" is the current template editor.

## 2. Overview (landing section)
- Today: emails sent / daily capacity, replies waiting, interested replies, meetings booked, new leads, new sign-ups, sign-ups from outreach links, Pro upgrades, credit purchases.
- Last 7 days chart: emails sent, replies, sign-ups.
- "Needs you" list: drafts to approve, interested replies to answer, failed sends, sending health warnings (e.g. SendGrid out of credits, high bounce rate).
- Numbers come from one admin-checked database function so the page loads in a single call.

## 3. One lead list
- Agent HQ's lead list becomes the only one. New fields: phone, city, state, country (default US), source, owner, stage, fit score, tags, place id, partner code, email/SMS consent + where consent came from, unsubscribed date, linked app account, next action + date.
- Stages: new, researched, in_sequence, replied, meeting_booked, partner_onboarding, active_partner, signed_up, not_interested, do_not_contact. The old status field is kept in sync automatically so existing outreach automation keeps working.
- Copy all rows from the old Admin lead list (company becomes business name), skipping emails already present (ignoring case). Lead-magnet and partner-form leads get email consent with that form as the source.
- New activity timeline table; old lead activities and Agent HQ outreach/reply history are copied in.
- Partner sign-up and lead-magnet forms write to the unified list from now on.
- No duplicate emails or duplicate map places allowed.
- When someone signs up with an email matching a lead: link the account, set stage to signed_up, stop that lead's cold emails.

## 4. One person view
- Opening a lead or a user opens the same side panel: contact details, stage, owner, tags, consent, full timeline (emails, replies, calls, notes, sequence steps, campaign sends) and, if linked to an account: plan, credits, scans, price checks, purchases, the outreach link they came from, last active date.
- Users list shows a "Lead history" badge for users who came from outreach.

## 5. Suppression and unsubscribe
- A single "do not email" list (unsubscribed, bounced, complained, manual). Every outreach sender (broadcasts, drips, Agent HQ email lane, campaigns) checks it before sending.
- A public unsubscribe link with a signed token: opening it shows "You're unsubscribed from MyCollectAI emails"; Gmail/Outlook one-click unsubscribe also works. It adds the address to the list and marks the lead do-not-contact. Requires a new UNSUBSCRIBE_SECRET (I'll generate it).
- Replies like "stop" / "remove me" / "no more emails" do the same automatically.
- Account emails (receipts, sign-in, password reset) keep working for unsubscribed addresses.
- The existing unsubscribe tokens and SendGrid suppressions keep being honoured.

## 6. Report back
- Screenshots of the admin area at desktop and phone width.
- Number of leads copied, number linked to app accounts, and any rows that couldn't move (with reason).

## Technical details
- New `src/pages/admin/AdminShell.tsx` using shadcn Sidebar; hash-driven section map in `src/lib/adminSections.ts` (with tests for hash → section and redirects). Admin.tsx and AgentHQ.tsx tab bodies extracted into section components, logic unchanged. Gate = existing `is_admin` / `is_agent_admin` checks; sections a user can't access are hidden.
- Migration (additive only): new columns on `agent_leads` (all nullable or with defaults); `agent_activities` (lead_id, rep_id, type, body, meta, created_at) with grants + RLS via `is_agent_admin()`/`is_admin()`; `email_suppressions` (email pk, reason check, source, created_at); unique indexes on `lower(email)` and `place_id` (dedupe existing agent_leads first, reporting conflicts); stage↔status sync trigger; trigger on `profiles` insert linking matching leads and cancelling pending `agent_outreach`/drip rows; `admin_overview()` SECURITY DEFINER aggregate. Backfill INSERT…SELECT from `leads` and `lead_activities` in the same migration. Old `leads`/`lead_activities` get write policies removed and a DEPRECATED comment (tables and rows kept).
- `partner-signup` and `lead-magnet` edge functions switched to insert/upsert into `agent_leads`; drip queue references updated to agent lead ids for new rows.
- New public `unsubscribe` edge function (verify_jwt off), HMAC-SHA256 token over email; GET page + POST one-click (List-Unsubscribe-Post). Senders add `List-Unsubscribe` headers and check `email_suppressions`; `agent_record_reply` maps "unsubscribe" intent to suppression. Existing `email-unsubscribe` flow untouched.
- AGENTS.md: rule that agent_leads is the single lead table and all outreach senders must check email_suppressions.
