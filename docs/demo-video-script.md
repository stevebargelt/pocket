# Pocket — demo video script (~25s)

A short, looping demo for the portfolio site. Captures the live Glove 80 keymap, the corpus router, a drill, and the results screen.

## Pre-roll setup

- `npm start`, browser at `localhost:3000`.
- Keymap pre-loaded (your factory Glove 80 in `keymaps/`).
- Practice view, idle phase. Window framed so the Glove 80 SVG and the layer picker are both visible.
- DevTools closed. Mac dock hidden. Mouse parked off the keyboard.

## Beat 1 — Brand reveal (~2s)

Open on the practice landing with the Glove 80 SVG already rendered. The header logo + "Pocket — break in your Glove 80" tagline reads in the first frame. Hold still.

## Beat 2 — Live keymap (~4s)

Click through 2–3 entries on the layer picker (e.g. base → symbols → nav, whatever your layers are named). The SVG re-renders with the new layer's bindings; the Mac mod glyphs (⌘ ⌥ ⌃ ⇧) are visible on the thumb cluster. Land back on the layer you want to drill.

## Beat 3 — Corpus router (~3s)

Scroll down to the context picker. Click through 2–3 contexts (prompts / CLI / code / email / Teams). The recommender card updates per context. Land on whichever context you want to demo.

## Beat 4 — Start a drill (~2s)

Scroll back up. Click the **start `<layer>` drill** button. Brief loading flash, then the typing surface appears.

## Beat 5 — Type (~9s)

Type through the drill text at a comfortable pace — not fastest. Viewers need to read the moving cursor. Don't worry about accuracy; a couple of misses make the results screen punchier.

## Beat 6 — Results (~4s)

Land on the results screen. Raw WPM, accurate WPM, accuracy, and the per-key heat map are all visible in one shot. Hold the frame for ~2 beats so the eye can land on the numbers, then cut.

**Stop recording.**

## Editing notes

- Trim dead frames front and back.
- Screen Studio: one auto-zoom on the layer picker click, one on the context picker, one on the results numbers. No more — gets dizzying on loop.
- Export WebM, target 2–3 MB. Drop to 24 fps before resizing if oversized.
- For the autoplay-loop seam, the last frame (results) cuts back to the brand-reveal cleanly enough; no fade needed.

## What NOT to try to capture

These were in an earlier draft but aren't built — don't waste a take trying:

- **Drag a `.keymap` into Finder → live SVG snap.** The client only refetches the keymap when the practice view re-enters idle; a drop while already on the landing won't update the UI.
- **Active key highlighting on the Glove 80 SVG as each character is typed.** The keymap view is hidden during typing.
- **Heat map filling in live during typing.** The heat map shows on the no-keymap fallback and on the results screen, not during a session.
