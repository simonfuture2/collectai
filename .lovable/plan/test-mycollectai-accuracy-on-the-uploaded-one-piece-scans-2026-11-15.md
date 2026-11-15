# Test MyCollectAI accuracy on the uploaded One Piece scans

## Goal
See how well MyCollectAI reads Japanese One Piece cards, using the same cards in your screenshots, and compare our answers with the other app's.

## Cards to test (from the screenshots)
1. Monkey.D.Luffy, Japanese, film art (other app said PRB-02, price N/A; its second guess was Shanks ST16-004)
2. God Thread / 神誅殺, Japanese event card (other app: PRB-02 Foil, raw $2.15)
3. Gum-Gum Giant / ゴムゴムの巨人, Japanese gold-border event, OP09-078 (the clear photo, no scan result shown)

## Steps
1. Crop each card out of the screenshots so only the card is in the photo, without the other app's overlay. Keep the original full photo too.
2. Run each photo through our real scan (identify, then price check) as a Price Check Lab run, so it uses no credits or limits and stays off the accuracy log.
3. For each card, record:
   - our top 3 guesses (name, set, number, language, foil or parallel)
   - the price we show and where it came from (PriceCharting or eBay)
   - how long the scan took
4. Check each card's true identity against public card lists (set code and number printed on the card) and compare against both apps.
5. Report a simple table: card, true answer, our answer, their answer, right/wrong, time.

## What I will not change
No app changes in this step. If we get cards wrong (for example Japanese text or set codes), I'll list the likely causes and propose fixes for you to approve separately.

## Technical details
- Use the existing Lab path (lab:true, admin session techbatrony@gmail.com) against identify-card and price-check.
- Photos come only from the uploaded images and are cropped with code. Nothing is saved to the app.
- Results are saved to /mnt/documents/scan-tests/one-piece-2026-11-15.md.
