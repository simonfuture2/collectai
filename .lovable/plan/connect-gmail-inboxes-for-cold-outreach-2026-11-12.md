# Connect Gmail inboxes for cold outreach

No cold inboxes are saved yet, and today cold emails wait for n8n to send them. This plan lets the app send from your Gmail inboxes directly and catch bounce notices itself, so n8n is no longer needed for sending or bounces.

## What you need first
- One or more Google Workspace inboxes on lookalike domains (e.g. simon@getmycollectai.com), never mycollectai.com. If you don't have them yet, the setup still works once they exist.

## Steps
1. **Connect each inbox.** I open a Gmail connect card once per inbox; you sign in to that inbox and allow reading, sending and labelling.
2. **Match inboxes to the outreach list.** Each connected inbox is added to the Sending inboxes list in Admin with your daily limit (default 30) and warm-up date. The section shows "Connected" or "Needs reconnect" per inbox.
3. **Sending.** The sequence runner sends approved cold steps from the matched inbox, keeping every existing rule: weekdays 8:30–17:00 recipient time, 2+ days apart, daily cap of 50 total and per-inbox limits, plain text, unsubscribe line and mailing address, suppression check right before each send. A test copy goes to Mycollectaiteam@gmail.com first.
4. **Bounce notices.** Every 30 minutes the app checks each inbox for bounce/complaint notices, records them (suppresses the address, marks the lead bounced, stops the sequence, auto-pauses the inbox if its bounce rate is too high), and labels the notice so it isn't counted twice.
5. **Replies** found in the same check stop the sequence, as now (auto-replies ignored).
6. **Test.** Send one test cold email to the test address and a deliberate bounce (fake address on a real domain), then confirm it shows up as bounced and suppressed.

## Technical details
- Gmail connector, one connection per inbox (secrets GOOGLE_MAIL_API_KEY, _1, _2...). Store the secret name per row in sending_accounts (new column `connection_secret`); mailbox verified via users/me/profile.
- New `_shared/gmailSend.ts` (RFC 2822 + RFC 2047 headers, base64url) used by sequence-tick through pickLane/assertLane('cold'); n8n claim path stays as a fallback.
- New `gmail-bounce-scan` edge function + cron: query `from:mailer-daemon OR subject:(Delivery Status Notification)` via batch metadata reads, parse failed recipient, call agent_record_bounce, apply a "CollectAI/processed" label. Parsing rules in `_shared/bounceParse.ts` with tests.
- Scopes: gmail.send, gmail.readonly, gmail.modify, gmail.labels.
