# Shop Partner Program

Card shops offer MyCollectAI free to their customers and get credit for every customer who signs up through them.

## What gets built

1. **Shop records** - each partner shop has a name, web address (e.g. bel-air-cards), its own code (e.g. shop_belaircards), level (listed / partner / featured), status (onboarding / active / paused), assigned rep, logo, and a staff list (owner or staff). The shop code is used like any other ref code, so sign-ups and paid conversions are counted by the existing tracking.
2. **Shop page /s/:slug** - phone-first: logo, name, "Free card price checks, powered by MyCollectAI", a big "Start scanning free" button (saves the shop code, sign-up, then the live scanner), 3-step how it works, optional address and website. No marketplace content. Hidden from Google until the shop is active.
3. **Counter kit** - letter-size counter sign PDF, table tent PDF and a QR code image, with shop name and logo, our brand colors and "Scan your cards free – ask us how."
4. **Partner dashboard /partner** (owners and staff only) - this month's sign-ups, price checks by those customers, and paid conversions when revenue share is on; download kit; edit profile and logo; invite staff.
   - Staff get Pro free while the shop is active, removed when paused. Anyone already paying through Stripe or Google Play is never touched.
   - "Shop mode" for staff: the live scanner opens in Insights mode (nothing saved to their collection) and shows a "Buy offer" at a set % of market value (default 60%).
5. **Revenue share (reporting only)** - per-shop % on paid conversions in a customer's first 12 months, default 0 (off). Monthly report in Admin → Growth → Partners showing conversions and amount owed. Payouts happen outside the app.
6. **Rep onboarding** - moving a lead to "partner onboarding" creates the shop, its web address, code and kit, and drafts a welcome email (shop page link, kit, how staff sign up) for approval. A checklist on the lead: page approved by owner, kit printed, staff signed up, first 10 customer sign-ups. Owner approval moves the lead to "active partner" and makes the shop active.
7. **Public /partners page** - explains the program (free tool, free Pro for staff, counter kit, optional revenue share). Form: shop name, contact name, email, phone, city/state, website, "What do you sell?" checkboxes, SMS consent box. Each submission becomes a hot lead.
8. **Test with a sample shop** - create it, open its page, sign up a test customer through it, confirm the sign-up shows on the partner dashboard and in the rep's results, and make the counter sign PDF.

## Technical details

- Migration: `partner_shops` (unique slug and partner_code, tier/status checks, revenue_share_pct default 0, buy_offer_pct default 60, show_address/show_website, checklist jsonb), `partner_shop_staff` (shop_id, user_id, role, unique pair). GRANTs plus RLS: public reads active shops (and onboarding ones only through the slug lookup function); staff read their shop; owners update profile; admins and the owning rep manage everything.
- `user_credits.billing_source` (nullable, default null). `partner_sync_staff_pro()` trigger on shop status and staff changes: sets plan 'pro' + billing_source 'partner' only when there is no Stripe subscription and plan isn't already paid; reverts only rows where billing_source = 'partner'.
- `agent_leads` stage trigger: on partner_onboarding, calls `partner_create_from_lead()` (slug/code uniqueness, sets lead.partner_code) and queues the welcome draft in agent_outreach as pending approval (transactional lane, not cold).
- `partner_stats(_shop, _since)` and `partner_revenue_report(_month)` security-definer functions read agent_attribution + credit_transactions.amount_cents by ref code; rep results already count partner sign-ups by partner_code.
- Rules (slug/code generation, buy-offer maths, 12-month revenue window, staff Pro eligibility) in `src/lib/partnerShops.ts` with tests.
- Kit PDF built in the browser with jsPDF + qrcode; logos in a private storage bucket with signed URLs.
- Staff invites via an edge function (admin/owner checked) that adds an existing account or emails an invite link.
- Shop mode stored per device; LiveScan reads it to default to Insights and show the buy offer.
- New admin section "partners" content extended with shops list and revenue report; AGENTS.md rule for partner rules location.
