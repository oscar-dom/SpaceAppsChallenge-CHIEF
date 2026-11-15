# Pitch video storyboard

An animatic of the 30-second video for the NASA Space Apps judges, timed to the final voice-over
([`../chief-animator/voiceover.mp3`](../chief-animator/voiceover.mp3), 30.6 s):

1. The lonely ship over a cartoon Earth ("In orbit, the nearest doctor is 400 kilometres away.").
2. A beam of light reaches the ship as the screen turns white ("Until now!").
3. CHIEF appears on the white ("Hi, I'm CHIEF."), drawn by the [animator](../chief-animator/)
   and kept over the next scenes.
4. The app screenshots of [`../screenshots`](../screenshots/), in their numbered order, as CHIEF
   describes each feature (dashboards, alerts, mission route, inventory, body systems).
5. Back to space, the ship no longer alone ("You will never be alone again!").

The page also has the voice-over text, one card per scene (visual, sound, transition and why it
works) and production notes.

## Use it

Open [`index.html`](index.html) in Chrome; it needs no build. If the browser blocks the animator
frame or the audio when opened from disk, serve the `video` folder (`npx serve video`) and open
`/storyboard/`.

- **Play** starts the voice-over and CHIEF's timeline together. **Voice-over** off plays it silent.
- **Full screen** or `F` shows only the stage, clean, to screen-record it; `Space` plays, `R`
  restarts, `Esc` exits.

CHIEF is the animator page embedded with `?embed` (only its transparent canvas); the storyboard
starts and stops its timeline with `postMessage`. Its positions and gestures are set in the
animator's timeline.
