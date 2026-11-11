# Sending rebuild: three lanes, cold inboxes, broadcasts

## What you get
- Every marketing email goes out through one of three lanes, and the lane rules are checked in code:
  - **Cold:** leads who never opted in. Sent one at a time, in plain text, only from your cold Gmail inboxes (through n8n) or from Instantly. Never through SendGrid or the main domain.
  - **Opted in:** app users who ticked "Send me tips and updates", plus people from the lead magnet and the partner form. Sent through SendGrid, using its unsubscribe group and our own stop list.
  - **Account emails:** receipts, sign-in and password emails only. These keep using today's email queue.
- Any send that doesn't match its lane is refused and logged.
- **New tick box at sign-up:** "Send me tips and updates", unticked by default. There's also a matching switch in Settings. Existing users start opted out.
- **Channels → Sending accounts:** add your Gmail inboxes there. Each inbox gets:
  - a daily limit (30 by default) and a warm-up start date (+3 a day);
  - a pause switch and a count of what it sent today.

  Overview shows today's total cold capacity, plus a reminder to keep cold inboxes on separate lookalike domains.
- **Instantly:** connected with your API key. Approved leads and their opening lines go into an Instantly campaign. Every 15 minutes, sends, replies and bounces come back into timelines, replies and the stop list. It's built so Smartlead can be added later.
- **Broadcasts** replaces Campaigns:
  - Pick a template, then build an audience from filters: type, stage, source, tags, state, last contacted, never contacted, user plan and last active.
  - Always left out: anyone unsubscribed, do-not-contact, not interested, who replied in the last 30 days, or who is in an active sequence.
  - Before sending you see the exact count per lane, previews for 3 real recipients, and a "Send test to me" button.
  - You can send now or spread sends over N days. Cold emails go out on weekdays only, 8:30–17:00 in the recipient's time.
  - Each broadcast tracks queued, sent, failed, bounced, replied, unsubscribed, and sign-ups from its own ref code.
- **Templates:**
  - Plain text with merge fields: first name (with a fallback), business, city, ref link, rep name, unsubscribe link, mailing address.
  - A footer is added automatically: "MyCollectAI · address · Unsubscribe". Opted-in emails also get one-click unsubscribe headers.
  - Current templates are copied over, including your story email as two versions: "Collectors & creators" and "Card shops".
- **Old paths:**
  - Cold bulk send and SMS to leads are removed. One-off emails to a single lead from the person panel stay, and follow the lane rules.
  - SMS goes only to people who agreed to texts.
  - Drips send only to opted-in leads until sequences are built.

## The story email (first broadcast)
- **Collectors & creators:** leads contacted at least once, no reply, not stopped. Today that is **0 people**.
- **Card shops/sellers:** same rules, and the 2 shops that already signed up are included. Today that is **22 people**, all cold, none opted in. They would go out from your Gmail inboxes over 5 weekdays.
- Ref codes are bc_story_collectors and bc_story_shops.
- Nothing goes out until you've received a test of each version and seen the counts per lane.

## What I need from you during the build
- **SendGrid unsubscribe group number:** I'll ask for it through a secure form.
- **Instantly API key:** a connect card will ask for it.
- **Your Gmail inbox addresses:** enter them in Channels. Each one also needs to be connected in n8n. I'll update the n8n workflow so it sends from whichever inbox each email is assigned to.

## Technical details
- `_shared/lanes.ts`: `pickLane()` and `assertLane()`, with tests. Every sender calls them, including campaign-outreach, drip-campaign, the new broadcast-send and the n8n claim function.
- **Database additions:**
  - `profiles.marketing_opt_in`.
  - `sending_accounts`, with warm-up limit = min(daily_limit, warm-up start + days × increase).
  - `email_templates`.
  - `broadcasts` and `broadcast_recipients`, with the planned send time, lane, account, status and ref code.
- `agent_claim_approved_emails` hands out work round-robin to inboxes that still have room today, and returns the inbox email so n8n picks the right Gmail account.
- **Scheduled jobs:**
  - every 5 minutes: release due broadcast recipients, rechecking each one;
  - every 15 minutes: Instantly sync.
- `src/lib/broadcasts.ts`: audience exclusions, quiet hours, spreading across days and capacity, and merge-field fallbacks, with tests.
- Screenshot of the broadcast screen showing both audiences.
