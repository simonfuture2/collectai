# Grading webinar page (email first, then watch)

Waiting on: the full webinar recording. Upload it here (MP4 or MOV) when ready; the page is built so the video slots in.

## What visitors see
- New public page **/webinar/grading**: headline, 3-4 "what you'll learn" points, a blurred preview frame of the video, and a short form (email, first name, consent box).
- After submitting, the video plays right on the page, and they get a "here's your replay link" email so they can come back.
- Under the video: "Scan your first card free" button and the Grading Cheat Sheet offer.
- Return visitors who already signed up skip the form.

## Lead generation
- Every sign-up becomes a lead with source "webinar_grading", marked opted in (they ticked the box), so they join the opted-in follow-up drips, never cold sending.
- Tracked steps in the Results tab: page view, form submitted, started watching, watched 50%, finished, clicked "Scan free".
- Link to the page from the Free Guide page, footer and grading guides; add it as a lead source in /admin.
- Page is indexed for search with its own title and description.

## Technical details
- Video uploaded as a CDN asset; page lazy-loads it only after unlock.
- Reuse the FreeGuide lead capture path (agent_leads insert + opt-in + suppression check), events via trackAgentEvent.
- Replay email sent through the opted-in lane (SendGrid), with unsubscribe.
- Unlock remembered in local storage.
