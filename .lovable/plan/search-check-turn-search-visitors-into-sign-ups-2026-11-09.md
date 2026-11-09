# Search check: turn search visitors into sign-ups

## Where things stand
A fresh check passed all the basics: Google can reach and read every page, the sitemap and crawler rules are fine, titles, descriptions, share previews and the site icon are set, and Search Console is connected. Search isn't the bottleneck yet. Google has only shown the site about a dozen times, so most new users will come from sharing, communities and demos, not search, for now.

One real problem remains: the search data claims a 4.8-star rating from 1,200 reviews that nobody can see on the site. Google can penalise made-up ratings.

## Changes
1. **Remove the unverified 4.8-star / 1,200-review rating** from the home page's search data. Pricing info stays.
2. **Add a free Price Check page for search** (`/price-check`): "What's my Pokémon card worth? Free photo price check." It explains the free scan, the PriceCharting values and graded prices, shows the Magikarp & Wailord scan example, and has one clear "Check a card free" button that goes to sign-up and then straight into Price Check. Free price checks are the easiest thing to offer new visitors, and right now no page targets that search.
3. **Point the home page buttons at sign-up**: the main home page button and the button under the demo result say "Check your cards free — sign up". After sign-up, people return to what they were doing.
4. Add the new page to the sitemap and link to it from the home page and footer.

## Not included
No made-up reviews, user counts or prices. No blog posts. The new page's wording will only use facts already in the app.

## Technical details
- `index.html`: drop the `aggregateRating` block from the SoftwareApplication JSON-LD.
- New `src/pages/PriceCheckLanding.tsx` with Helmet title/description/canonical `https://mycollectai.com/price-check`, a visible H1, and a CTA to `/auth?redirect=/scan?mode=price`. Route it in `App.tsx`, add it to the sitemap, and link it from Landing and the footer.
- Mark `agent_metadata:structured_data` fixed after the edit.
