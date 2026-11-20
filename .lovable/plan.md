# Front and back photos by scan type

## What changes for users

| Scan type | Photos needed |
|---|---|
| Price Check | Front only (no change) |
| Scan to Collection | Front **and** back, both required |
| Insight Scan | Front and back, same as collection |
| Grading / full analysis | The original front and back camera photos, both required |

Sealed products and barcode scans are unchanged.

### Upload page (/scan)
- In collection and insight mode, the Scan button stays disabled until both a front and a back photo are added. The note "we can identify from the front alone" is replaced with "Add the back of the card to continue."
- Slabs also need front and back.

### Live camera (/scan/live)
- Price mode keeps working the way it does now: one quick front shot per card.
- Collection mode becomes two steps per card: capture the front, then the screen says "Flip it — scan the back", then capture the back. The card is only added once both sides are in. A "Retake" option covers bad shots.
- A price-checked card that someone adds to their collection afterwards gets the "Add back photo" step before it is saved.

### Grading
- The full analysis and pre-grade only run on the original full-size front and back camera photos, never on the small cropped price-check image.
- If a saved card has no back photo (for example older price-only saves), the "Grade" / "Full analysis" button opens "Add front and back photos to grade this card" instead of charging a credit.

## Technical details
- New `src/lib/scanPhotos.ts`: `requiredSides(mode, itemType)` and `canSubmit(...)`, with tests (price → front; collection/insight card or slab → front+back; sealed → unchanged). Scan.tsx and LiveScan.tsx both use it.
- LiveScan: collection mode adds a `awaiting_back` phase to the state machine in use-live-scanner / liveDetect (tests updated). Keep the uncropped full-resolution frame for each side alongside the crop; upload both to card-images and pass both paths to `price-check-save`, which stores them as the card's front/back images.
- `price-check-save` rejects collection saves without a back path (server-side check, not just the button).
- `reanalyze-card` (rules.ts) refuses to start grading when the card has no back image, before any credit is taken; tests added. The analysis uses the stored original images.
- Card detail: "Add back photo" upload that attaches to an existing card, then enables grading.
