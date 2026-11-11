# Sequences and drips in one engine

One follow-up engine for cold outreach and opted-in emails. It stops the moment someone replies, unsubscribes, bounces or signs up. It replaces the separate drip system and the old one-email-per-lead flow, and it uses the three sending lanes.

## What you get
- **Sequences & drips screen** (Outreach group):
  - Every sequence with its steps.
  - Counts by status and the reply rate for each step.
  - You can edit the days, angles and templates.
- **Bulk enroll from Leads**:
  - Up to 500 leads at once, spread over days to fit each lane's daily capacity.
  - Shows how many leads were skipped and why (opted out, already in a sequence, wrong lane, and so on).
- **Person view**: start, pause or stop a lead's sequence and see their upcoming steps.
- **Inbox**:
  - Drafts that need approval show up here.
  - An "interested" reply comes with a ready booking reply (your Google Calendar link plus the snapshot offer) that you approve in one tap.
- **Auto-approve** (a setting on each sequence): once you've approved 20 drafts from a sequence without edits, steps 2 and later send without asking.

## Sequences set up for you (all editable)
- **Card shops (cold)**:
  - Day 1: free 5-card price snapshot offer.
  - Day 3: call task with a script (you dial).
  - Day 5: counter tip.
  - Day 8: scanner video plus booking link.
  - Day 13: polite close-out.
- **Collectors (cold)**:
  - Day 1: value tip and a question.
  - Day 5: "kid, card and grade" story with your ref link.
  - Day 11: last note.
- **Creators (cold)**:
  - Day 1: collaboration idea.
  - Day 5: sample clip.
  - Day 11: last note.
- **Lead magnet welcome (opted in)**: the existing drip emails. Today's drip list has 18 items, all already sent, so no one is still mid-way and nobody needs moving. The old drip sender gets switched off.
- **New users (opted in, only people who ticked marketing emails)**:
  - Day 0: welcome plus live scanner how-to.
  - Day 3: Pack Rip.
  - Day 7: sealed chase lists.
  - Day 14: invite friends.

## Rules (checked in code, with tests)
- **Cold sending times**: weekdays only, 8:30 to 17:00 in the lead's time zone (New York if unknown).
- **What stops a sequence**:
  - Any real reply (auto-replies don't count).
  - An unsubscribe or a bounce.
  - A sign-up.
  - A stage change to meeting booked, not interested or do-not-contact.
- **Who gets emailed and how often**:
  - Never an address on the stop list.
  - At least 2 days between emails to the same person.
  - Never more than an inbox or lane can send that day.
- **Links**: the first cold email has no links or images; later steps have at most 1 link.

## AI-written steps (through n8n)
- **What n8n gets for each due step**:
  - The lead record.
  - The step's angle or template.
  - Earlier messages.
  - Your signature, booking link and video links.
  - Mailing address, unsubscribe link and ref link.
- **Saved writing rules, sent with every draft**:
  - No invented statistics, prices, customers, partnerships or facts about the recipient.
  - Use only facts from the lead record.
  - Under 120 words, plain text, one question at the end, no hype words.
  - An approved list of MyCollectAI facts the AI may use.
- **Actions n8n can call**: get the next steps to draft, advance an enrollment, stop an enrollment.

## Test
- A fast clock (minutes instead of days) on a test sequence sent to mycollectaiteam@gmail.com.
- The test checks that steps advance, that a reply stops the sequence and that an unsubscribe stops it.
- You gave one address, so the test runs as 3 enrollments on that inbox: one plain, one +reply and one +unsub.
- Real delivery needs a cold Gmail inbox in Channels, or SendGrid credits for the opted-in lane. Until then, I'll check the steps and stop rules without sending.

## Technical details
- **Migration**:
  - New tables agent_sequences, agent_sequence_steps and agent_enrollments, with a partial unique index so a lead has only one active enrollment. Admin RLS and grants.
  - agent_outreach gains enrollment_id and step_id.
  - Functions agent_next_steps_to_draft, agent_advance_enrollment and agent_stop_enrollment.
  - Stop triggers on agent_replies insert, on agent_leads stage changes, on email_suppressions insert and on the sign-up link.
  - Writing rules and sequence links stored in agent_settings.
- **Rules code**: `_shared/sequenceRules.ts` and `src/lib/sequenceRules.ts` (the same logic) with tests: nextDueAt, stop reasons, the 2-day gap, link limits, auto-approve threshold and capacity spreading. They reuse lanes.ts for quiet hours and capacity.
- **Edge function `sequence-tick`** (cron every 5 minutes):
  - Turns due template steps into outreach rows: cold rows go to the approval queue or are auto-approved; opted-in rows go through SendGrid.
  - Turns due call/DM tasks into tasks.
  - AI steps wait for n8n.
  - A test multiplier makes a "day" last one minute.
- **agent-gateway**: new actions for n8n.
- **admin-data**: bulk enroll with a skip report.
- **Old paths**: the drip-campaign schedule is disabled and the function returns 410. Old tables stay as they are (nothing deleted).
- **Screens**: SequencesSection in the admin shell; the PersonDrawer sequence panel; an Inbox booking-reply card.
- **Docs**: an AGENTS.md rule for the sequence engine, and roadmap.md updated.
