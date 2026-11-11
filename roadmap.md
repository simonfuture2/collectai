# Roadmap — outreach
- [x] Sending lanes, broadcasts, cold inboxes, Instantly adapter
- [x] Sequences & drips engine (sequences, rules + tests, sequence-tick, n8n actions, admin screen, bulk enroll, person view, booking replies)
- [ ] SendGrid credits + SENDGRID_UNSUB_GROUP_ID (Simon) — needed for opted-in sends (Lead magnet welcome, New users)
- [ ] Add Gmail cold inboxes in Channels + n8n send step uses each email's from address (Simon) — cold steps wait until then
- [ ] n8n: workflow calling agent_next_steps_to_draft → agent_attach_draft for AI-written steps (n8n not connected here)
- [ ] Instantly API key + campaign id (Simon, later)
- [ ] Schedule the story broadcasts after tests arrive

## Lead generation for volume (2026-11-11)
- [x] Places shop search + import, live Google details, cost estimate, daily cap
- [x] Seller/creator CSV import, YouTube channel import
- [x] Website enrichment with sourced facts + fit score
- [x] Referral friend reward after 5 price checks, 30/month cap, Share this find, attribution
- [x] Two new guides with consent; QR show flyers; events; community keywords
- [x] Daily lead run 7:00 ET with Overview summary
- [ ] Bel Air Places search + 10-shop import — blocked: Google key needs Places API (New) enabled

## Sales rep workspace (2026-11-11)
- [x] sales_reps table + rep RLS on leads/activities/enrollments/outreach
- [x] /reps workspace: Today, call outcomes, book meeting, pipeline board, my results
- [x] Admin Reps section (invite, territories, goals, deactivate), assignment round-robin, unassigned queue, leaderboard, commission report
- [x] Rep name/signature/booking link + reply-to in sequence emails
- [x] Test with a second rep account
- [ ] AI-written (n8n) sequence steps don't carry the rep's name/reply-to yet — waits on n8n

## Shop Partner Program
- [x] Shops, /s/:slug, counter kit, /partner dashboard, staff Pro, shop mode, revenue report, rep onboarding, /partners form, sample test

## Deliverability and reporting (2026-11-11)
- [x] Email health card: SPF/DKIM/DMARC/MX per domain, cold-domain check, per-inbox 7-day health
- [x] Auto-pause inbox (>3% bounces or any complaint); Gmail bounces via n8n agent_record_bounce → suppressions
- [x] SendGrid Event Webhook → suppressions; broadcasts pause above 0.1% spam; Overview banner
- [x] Results: sequence/step funnel, lead type, source, shops, reps, week-over-week arrows, CSV
- [x] Weekly summary Mondays 8:00 ET (schedule id 44), test copy sent
- [ ] SendGrid webhook live — waits on Simon adding the webhook + SENDGRID_WEBHOOK_PUBLIC_KEY
- [ ] Gmail bounce matching — waits on n8n workflow calling agent_record_bounce
