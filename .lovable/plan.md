# Cold lead update email: "the card, the kid, and the grade"

## The email (for your review)

**Subject:** A kid, a card, and why we built MyCollectAI

Hi {{name}},

It's Simon from MyCollectAI. I reached out a little while back, and wanted to send a quick update along with a story that honestly reminded me why we started this.

**What's new**
- Free price checks. Scan a card and see what it's worth, no credits needed.
- Live scanning. Hold your phone over a card and it reads it on the spot, one card after another.
- Pack Rip mode. Scan your pulls as you open a pack and see your total and your biggest hit.
- Values from PriceCharting, checked against recent eBay sales.
- Android app coming soon to the Play Store.

**The story**
Not long ago, a dad and his son scanned a card the boy had pulled. The app showed it was worth a lot more than they expected. Instead of taking the first offer, they got it graded. I wish you could have seen that kid's face when it came back.

That kind of moment sticks with a kid for life. And it could easily have gone the other way. Some resellers know exactly what a card is worth and still lowball families who don't. A kid gets a few bucks, the reseller gets the real value, and the fun is gone.

That's why we built MyCollectAI: so collectors everywhere, young and old, can know what they have before anyone else tells them.

If that matters to you too, we'd really appreciate your help getting the word out. Share it with your community, try it yourself, or just reply and tell me what you think. Every bit helps.

Try it free: https://mycollectai.com/price-check

Thanks for reading,
P. Simon Batrony
Co-founder, MyCollectAI

## Notes on the edits
- I kept your tone. It's short and personal, written in first person, with no corporate words.
- I left the story general (no name, card or price) because I don't have those details. If you have them and the family is okay with it, adding the real card and price would make it much stronger.
- You get a "reply to me" ask plus one link, so the email doesn't read like an ad.

## Steps after approval
1. Save the email as a template in Agent HQ > Campaigns.
2. Send one test copy to you first so you can see how it looks in your inbox.
3. Send it to the leads marked cold through the existing bulk send, with an unsubscribe line at the bottom.
4. Report how many emails went out and which ones failed.

## Technical details
- Insert a `campaign_templates` row (channel email, HTML body, `{{name}}` placeholder).
- Send through `campaign-outreach` `bulk_send` (SendGrid). Before sending, check which lead status counts as "cold" and confirm the count.
