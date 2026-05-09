
# Competitive Review + Fun Feature Additions for CollectAI

## What we already do well
Single-photo AI scan, sub-grade breakdown (corners / edges / surface / centering), ROI grading calculator, real-market valuation (eBay sold + TCGPlayer + Claude verification), portfolio analytics, folders, public collection sharing, AuthentiSeal verification, referrals, freemium credits, scan progress timeline.

## What top competitors do that we don't (yet)

| App | Standout features |
|---|---|
| **CollX** (1M+ installs) | Marketplace (buy/sell/trade), social feed, follow collectors, "Scan+" enhanced AI, monthly buy-credit |
| **Ludex** | Bulk scan mode, price alerts/watchlist, multi-TCG breadth |
| **ZeroPop** | **4-angle scan**, defect map overlay, multi-grader estimates (PSA + BGS + CGC), centering ruler |
| **Guardian TCG** | Realtime camera scan, **market movers feed**, analytics dashboard |
| **CardGrader** | **"Perfect Pulls"** gamified pack-rip tracker |
| **Pokedata** | Trend charts, investor-grade transparency |
| **Pulio** | Custom binders, community posts |

## Recommended additions — ranked by "fun + appeal" impact

### Tier 1 — Highest delight, moderate effort

**A. Pack Rip Mode (gamified pulls)**
A dedicated flow: tap "Open a Pack", pick the set, scan each card you pull. We tally pack value vs. retail, surface a celebratory animation when a chase card is detected (holo / rare / >$50), and save the rip as a session you can share. This is the single most "fun" feature in the category and we already have the scan engine.

**B. Achievements & Streaks**
Lightweight badge system: First Scan, First Holo, First $100 Card, 7-Day Streak, "Cracked a Gem" (predicted PSA 10), "Set Completer" (X% of a set scanned). Renders as a row on Dashboard + a /achievements page. Pure presentation layer over existing data.

**C. Defect Map Overlay**
On the card detail page, render the user's photo with colored pins marking where the AI saw corner wear, edge dings, surface scratches, and centering offsets. Claude already produces sub-grades; we extend its prompt to also return `(x, y)` defect coordinates and render dots on the image. Huge perceived sophistication, ~one prompt change + a SVG overlay.

### Tier 2 — Strong "wow" features, larger effort

**D. Multi-Angle Scan (front + back + 2 corners)**
Optional 4-photo flow that materially improves sub-grade accuracy and unlocks the defect map. Falls back to single-photo for free tier; gated behind credits or Pro.

**E. Market Movers Feed**
Daily-refreshed home screen widget: "Top 5 cards trending up today" pulled from a scheduled edge function that runs Firecrawl across a curated watchlist (top-scanned cards across the user base). Becomes a reason to open the app daily.

**F. Watchlist + Price Alerts**
Star any card → push notification when sold-comp average moves >X% or crosses a target. We already have Capacitor push wired up.

### Tier 3 — Nice-to-have polish

**G. Card Lore Card** — Claude-generated 2–3 sentence fun fact / historical context shown on the detail page ("This 1986 Fleer Jordan was the only mainstream Jordan rookie..."). Cheap, delightful.

**H. Binder View** — flip-through virtual 9-pocket pages of the user's collection, with shimmer on holos. Pure frontend.

**I. Multi-Grader Estimates** — show predicted PSA / BGS / SGC grades side-by-side instead of just one. Prompt change only.

## My recommendation
Ship Tier 1 first as a coherent "Fun Pack" release: **Pack Rip Mode + Achievements + Defect Map**. Together they hit pulling, progression, and "wow this is sophisticated" — the three things competitors win on. Tier 2 follows once we see engagement lift.

## Which would you like me to plan in detail / build?
Options:
1. **Tier 1 bundle** — Pack Rip + Achievements + Defect Map
2. Just **Pack Rip Mode** (most fun, most viral)
3. Just **Achievements & Streaks** (lowest effort, broadest reach)
4. Just **Defect Map Overlay** (most "smart AI" credibility)
5. **Tier 2 bundle** — Multi-Angle + Market Movers + Price Alerts
6. A different combination — tell me which letters

Out of scope until chosen: backend schema for pack-rip sessions, achievement storage, push templates, image-overlay component — I'll plan those once you pick.
