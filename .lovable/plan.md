# Show the guide on the page when the email can't be sent

## What changes
- When a visitor signs up and the email fails (SendGrid out of credits), the success box no longer says "Check your inbox" or "we'll send it shortly".
- Instead it says: "You're in! Your guide is ready below." and shows the chosen guide (Grading Cheat Sheet, Sealed Chase List, or Value Check guide) right on the page, with a "Print / save as PDF" button.
- The pop-up message changes to "You're signed up — your guide is ready to read now."
- When the email does send, the current "Check your inbox" message stays, plus a "Read it now" button that opens the same guide on the page.
- The success box names the guide the visitor picked instead of always saying "Grading Cheat Sheet".

## Technical details
- lead-magnet returns `{ success, emailed, guideHtml, guideTitle }` for non-webinar guides (the same content it emails, built by the existing cheatSheetHTML / valueCheckHTML / sealedChaseHTML), so the email and page copy never drift.
- FreeGuide.tsx renders guideHtml in a sandboxed iframe (srcDoc, no scripts) inside the success card; Print button calls the iframe's print().
- Remove the unreachable duplicate `if (!sent) throw` block. Redeploy lead-magnet.
- Verify with one test sign-up in the browser that the guide appears on the page.
