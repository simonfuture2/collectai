# Fix auto-scan on the live scanner

## What I found in the current code (suspects, to be confirmed with the debug overlay)
- **Auto capture is blocked while the card-outline engine is still loading.** Automatic capture is skipped whenever that engine hasn't finished loading, but the shutter isn't blocked. If loading is slow or stalls on the phone, you get exactly "nothing happens until I press the shutter".
- **"Steady" also needs the photo to look sharp**, using a fixed threshold. On a real phone camera this can fail every frame, so the countdown resets and never fires. The shutter skips this check.
- **The duplicate guard never resets.** After a scan, any frame that looks similar (same background, similar card back or layout) is treated as the same card and shows "Already scanned", so scanning seems to stop after one card.
- **Errors pause scanning for 10 seconds**, and a limit error stops it until you tap play. Both feel like "scanning stopped".
- **Play/pause does change the setting**, but its label switches between "Switch to auto" and "Switch to manual" with no visible feedback. Because of the problems above, auto looks broken either way.
- The camera view is already muted and set up for iPhone, but the scanner never waits for the video to actually start playing before it begins looking.

## Steps
1. **Debug overlay first** (admins only, add `?debug=1` to the address): auto on/off, scanner state, frames per second, detection time per frame, outline engine loaded or using guides, card found plus area %, sharpness, motion, steady time, request in progress, last duplicate distance, cooldown left. I'll use it to confirm which of the suspects is the real cause and report back.
2. **One scanner state machine** in its own hook, with states: idle, searching, tracking, steady, capturing, checking, result, cooldown. Everything the loop reads is kept current, so it never works from an old copy.
   - The loop starts once the video is actually playing and runs about 10 times a second. It pauses while a sheet is open or the tab is hidden.
   - Auto on: steady for 600 ms, then capture. It no longer waits for the outline engine; until that loads it uses the guide box.
   - Auto off: the outline and messages still work, and the pill says "Tap the button to scan". The shutter works in both modes.
   - Result: green outline with "Found – {name}" for 1.2 s, then cooldown. Cooldown ends when the card leaves the frame (400 ms with no card) or a different card appears (duplicate distance over 10). The same card held still is never scanned twice.
   - Error: "Couldn't read that card – try less glare" for 2 s, then back to searching (down from 10 s). At the hourly limit, auto turns off with "You've hit 100 scans this hour – tap play to resume later".
   - The sharpness rule is checked against the debug numbers and set to a level a real phone camera passes.
3. **Play/pause button:** auto is on by default and the choice is remembered. Pause icon while running, play icon while paused, with a small "AUTO" label underneath that's highlighted when on. Tapping it shows a 1.5 s message at the top ("Auto-scan on – just hold up cards" / "Auto-scan paused – tap the button to scan"). Tapping play during cooldown or after an error goes straight back to searching.
4. **Idle hint:** if auto is on and no card has been in view for 4 s, the guide corners pulse gently and the pill says "Point at a card – it scans automatically".
5. **Testing:** a simulated camera run of 10 different cards in a row with no taps, plus one card held for 10 s (it must scan only once), reporting the debug numbers. Tests for the state-machine rules.

## What I can't do here
I can't use a physical iPhone, Android phone or the Android app. I'll run the simulated-camera tests and give you a short checklist for the debug overlay. Please send me the numbers from your phone so I can confirm the real cause on each device.

## Technical details
- New `src/hooks/use-live-scanner.ts`; pure transitions (state, cooldown exit, steady fire, error/429 handling) go in `src/lib/liveDetect.ts` with tests in `liveDetect.test.ts`.
- Loop is gated on `loadeddata`/`playing` with `readyState >= 2`; call `video.play()` after `srcObject`.
- Remove the `cvState !== "loading"` gate on auto capture; fallback guides are used until OpenCV is ready.
- Reset `lastHashRef` when the cooldown exits on "card left"; the dHash check only applies while in cooldown.
- `LIVE.ERROR_PAUSE_MS` goes from 10 s to 2 s; add `RESULT_MS 1200`, `LEAVE_MS 400`, `IDLE_HINT_MS 4000`.
- Persist auto mode in localStorage under `live_auto`.
- Record the hook/state-machine rule in AGENTS.md, replacing the existing live-scan rule.
