# Add the grading webinar to outreach sequences

## What changes
1. **Collectors sequence** - new email "Before you grade your next card" (your wording, unchanged), sent on day 8, after the story email and before the "Last note".
2. **Creators sequence** - the same email on day 8, after the sample clip and before the "Last note".
3. **Card shops sequence** - new email "A grading training your customers might like" on day 10, after the scanner video email and before the close-out.
4. **DM / comment reply** - your Instagram/TikTok/Discord reply saved as a ready-to-copy reply in the admin community area, marked "only when someone asks about grading". It's never posted automatically. You copy and post it yourself.

## How it behaves
- `{{first_name|there}}` uses the lead's first name, or "there" if there isn't one.
- `{{webinar_link}}` becomes mycollectai.com/webinar/grading, with a tag for the lead's sequence. Sign-ups from these emails then show in Results by source.
- Each email has exactly one link, so it follows the "at most 1 link on later steps" rule. The unsubscribe line and mailing address are added the same way as on every other step.
- All existing stop rules still apply: a reply, unsubscribe, bounce or sign-up stops the email. Emails stay 2+ days apart, cold sends only go out on weekdays from 8:30 to 17:00, and each step needs your approval like the other steps.
- These are fixed texts, not AI-written, so nothing gets reworded.
- Leads already partway through a sequence get the new step when they reach it.

## Technical details
- Add 3 templates and insert 3 steps into agent_sequence_steps (collectors/creators step 3 at day_offset 8, shops step 5 at day_offset 10). Renumber the later steps. Set include_link true and mark the steps fixed-template.
- Add `webinar_link` to the template variable fill in sequenceRules.ts (with a test that the link and the first-name fallback fill in correctly), using the URL from src/lib/webinar.ts.
- Add the DM reply as a saved snippet with a Copy button in the community drafts section.
