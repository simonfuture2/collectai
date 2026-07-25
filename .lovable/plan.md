
## Goal

When a card comes back from grading, the collection should reflect the real, authoritative data instead of the AI's raw-scan guess: show the slab grade, the grading company + cert number (with a way to verify it), the AuthentiSeal certificate (with verify link), and merge it with the original raw scan so the pre-grade history is preserved without double-counting value.

## Schema changes (single migration on `public.cards`)

Add columns:
- `is_authenticated boolean default false` — true once an AuthentiSeal cert is attached.
- `authentication_data jsonb` — full payload from the AuthentiSeal webhook (issuer, issued_at, status, item snapshot).
- `authenticated_at timestamptz`
- `grading_company text` — 'PSA' | 'BGS' | 'CGC' | 'SGC' | 'TAG' | 'AuthentiSeal' | null (from the slab).
- `grading_cert_number text` — the cert printed on the slab.
- `grade_numeric numeric` — parsed grade (e.g. 9, 9.5, 10) for math/sorting; `condition_grade` stays as the display string.
- `paired_raw_card_id uuid references public.cards(id) on delete set null` — on a graded card, points at the raw scan it superseded.
- `superseded_by_card_id uuid references public.cards(id) on delete set null` — on the raw card, points at the graded card that replaced it.
- Index on `(user_id, card_name, card_set, edition)` to speed pairing suggestions.

Backfill: any existing card with a non-null `authentiseal_serial` gets `is_authenticated = true`.

## Backend changes

1. **`authentiseal-webhook`** — extend the webhook payload contract to accept the full certificate (grade, grader, issued_at, issuer, item snapshot, status). Persist to `authentication_data`, set `is_authenticated=true`, `authenticated_at=now()`, and, when present in the payload, `grading_company` / `grading_cert_number` / `grade_numeric` / `condition_grade`. Keep the existing serial-only update path working.
2. **New edge function `verify-slab-cert`** — thin proxy that calls the grader's public lookup endpoint by `(company, cert_number)` and returns `{ verified, grade, subject, url }`. First-cut providers: PSA (`https://www.psacard.com/cert/{n}`), BGS, CGC, SGC as link-outs when no public API; return a `verify_url` in that case so the UI can still deep-link.
3. **New edge function `suggest-card-pair`** — given a graded card id, returns the top raw candidates from the same `user_id` scored by exact match on `card_name` + `card_set` + `edition/number`, then image-similarity as a soft tiebreak (reuse the identify pipeline's existing embedding if available, otherwise skip). Returns 0–5 candidates with a confidence.
4. **New edge function `pair-cards`** — authenticated action that sets `graded.paired_raw_card_id = raw.id` and `raw.superseded_by_card_id = graded.id` in a single transaction; validates both cards belong to `auth.uid()`.

## Frontend changes (presentation + wiring, scan pipeline untouched)

1. **`src/components/AuthenticatedProfile.tsx`** (new) — premium GlassCard rendered at the top of `CardDetail` when `is_authenticated` OR `grading_cert_number` is set. Sections:
   - Grade block: big grade (from `condition_grade`/`grade_numeric`), grading company, cert number (mono, copy button).
   - "Verify slab cert" button → calls `verify-slab-cert`; on success shows a green check and the grader's public cert URL; on link-only providers, opens the URL in a new tab.
   - AuthentiSeal block: serial, issuer, issued date, status, "View certificate on AuthentiSeal" outbound link (reuses `AuthentiSealVerify` in `verifyOnly` mode with `defaultSerial`).
   - Replaces the AI "Should I grade this?" ladder with a "Graded value" summary using graded comps for the actual grade.
2. **Manual entry** — inside `AuthenticatedProfile`, an "Add slab cert" form (grader dropdown + cert number) writes `grading_company` / `grading_cert_number` and triggers `verify-slab-cert`. Available even when the card was scanned raw so the user can attach after the fact.
3. **Pairing UI on the graded card's detail page**:
   - Banner "This looks like a graded version of a card you already own" with the top suggestion from `suggest-card-pair` and a **Pair** button.
   - "Pick another" opens a searchable list of the user's raw cards.
   - After pairing, a "Before grading" timeline block appears on the graded card showing the raw scan's image, AI estimated grade, AI value range, and scan date — read-only view of the raw entry.
4. **Raw card behavior when superseded**:
   - Hidden from the default Collection grid and portfolio totals (filter `superseded_by_card_id is null`).
   - Still reachable from the graded card's "Before grading" block; its own detail page shows an "Upgraded to graded version →" banner linking back to the graded card, with an **Unpair** action.
5. **Scan reveal** — after identification, if the new card has a slab cert or authentiseal serial, kick off `suggest-card-pair` in the background and surface the pairing banner in `ScanReveal` before "Add to Collection".
6. **Portfolio math** — `PortfolioHero`, Dashboard stats, and `Collection` queries filter out superseded raw cards so the graded value is the single source of truth and nothing is double-counted.

## Verification steps

- Snorlax example: open the graded Snorlax → Authenticated Profile renders with slab cert + AuthentiSeal serial, "Verify" returns a green check, pairing banner suggests the original raw Snorlax, tapping **Pair** hides raw from the grid, and the graded card shows the raw scan as pre-grade history.
- Portfolio total before pairing == after pairing minus the raw estimate plus the graded value (no double-count).
- Manually attaching a PSA cert to a raw card flips it to the authenticated profile without needing an AuthentiSeal webhook.

## Out of scope

Scan pipeline, `analysisEngine.ts`, pricing logic, Stripe, and Supabase auth stay untouched.
