# Google Search ad campaign: free Price Check sign-ups

## What's settled
- **Goal:** free sign-ups (the person creates an account, then runs a free Price Check)
- **Who:** Pokémon and other card-game collectors, plus pack rippers
- **Where:** United States, English
- **Budget:** about $10/day (~$300/month). The exact amount gets your approval before launch.
- **Channel:** Google Search text ads
- **Landing page:** the free Price Check page (/price-check), whose button already goes to sign-up and then straight to Price Check
- **Angle to test:** "What's my card worth? Free photo price check, real PriceCharting values, no credits." This answers collectors' doubt about accurate prices. The paid scanner apps don't lead with free.

## Steps
1. **Save the campaign brief** in Files with these choices and today's research (search volumes, click-cost estimates, what's still unchecked).
2. **Connect your Google Ads account.** A card opens to sign in with Google and pick or create the account. Billing can be added later. Ads only run once it's on.
3. **Count sign-ups in Google Ads.** Add Google's tracking tag to the site and report a "sign-up" each time a new account is created (email or Google). This tells Google which searches bring real sign-ups. I'll also check whether the site needs a cookie-consent prompt.
4. **Write the ads for your approval:**
   - About 20–30 keywords, such as "pokemon card value", "how to check pokemon card value", "pokemon card scanner", "free card scanner app", "what are my pokemon cards worth", "one piece card value", "pack opening card value"
   - Words to exclude so you don't pay for the wrong clicks: "buy", "booster box for sale", "jobs", "wallpaper", "game download"
   - 15 headlines and 4 descriptions, using only true claims (free price check, PriceCharting values, Pokémon/One Piece/Magic/Yu-Gi-Oh!/Lorcana)
5. **Readiness check before spending:** publish the tracking change, open the Price Check page as a new visitor, sign up with a test account, and confirm the sign-up is counted. Then delete the test account.
6. **Launch:** an approval card shows the campaign settings ($10/day, US, English, keywords, ads, bidding for sign-ups). Nothing spends until you approve it there. We can start it paused if you'd rather turn it on yourself.

## After launch
- Google reviews new ads, usually within a day.
- At $10/day, give it 2–3 weeks before judging. Then review which searches brought sign-ups, drop wasted keywords, and decide whether to raise the budget or add a YouTube or Instagram campaign for pack rippers.

## Technical details
- Brief: `/mnt/documents/marketing/` campaign brief + collection. Account via the Google Ads setup tool.
- Conversion: a Google Ads conversion action (category SIGNUP). The gtag fires once on first-session account creation for email and OAuth sign-ups, deduplicated per user. One Google tag only.
- Campaign: Search, `landing_path=/price-check`, bidding Maximize conversions (no target CPA at first), goal_mode standard [SIGNUP], search partners off.
- Record the tracking decision in AGENTS.md.
