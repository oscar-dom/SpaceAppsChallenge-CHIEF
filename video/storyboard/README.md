# Pitch video storyboard

An animatic of the 30-second video for the NASA Space Apps judges, timed to the final voice-over
([`../chief-animator/voiceover.mp3`](../chief-animator/voiceover.mp3), 30.6 s; AI text-to-speech made
with ElevenLabs, voice "Jessica"):

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
- **Music** plays a score and sound effects synthesised in the page with Web Audio (no audio
  files, no licences), on the same clock as the scenes and about 10 dB under the voice: a lonely
  minor drone with a heartbeat, a riser into the beam, a warm chime for "Hi", a light pulse under
  the features (a friendly alert chime, a rising tone when CHIEF resolves it), a build through the
  body systems and a bright chord for the payoff. The plan is in `buildScore` in `index.html`.
- **Export video** records the stage with the voice-over and music and downloads `chief-pitch-video.webm`
  when it ends. Chrome asks what to share: pick this tab. It needs the page served (see above) for
  the voice; the video's size is the stage's size on screen, so widen the window first.
- **Full screen** or `F` shows only the stage, clean, to screen-record it; `Space` plays, `R`
  restarts, `Esc` exits.

CHIEF is the animator page embedded with `?embed` (only its transparent canvas); the storyboard
starts and stops its timeline with `postMessage`. Its positions and gestures are set in the
animator's timeline.
