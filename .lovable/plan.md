Replace lines 107–118 of `src/pages/Landing.tsx` (the three-stat row under the "Scan Your Card Now" CTA) with three category pills:

- Pokémon
- Magic, Yu-Gi-Oh!
- Sports Cards

Treatment:
- Same wrapper layout: `flex flex-wrap gap-3 mt-8 justify-center md:justify-start`.
- Each pill: rounded-full, subtle bordered background (`border border-border bg-card/60 px-4 py-2`), with `text-gradient-primary` font-display font-semibold label.
- No values, no metric subtitles, no claims.

Nothing else on the page changes.