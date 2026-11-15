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

Run `npm run video` in the project folder: it serves `video/` on http://localhost:5180 and
opens the storyboard in the browser (no build, no install). Opened straight from disk, the
browser may block the animator frame or the voice-over.

- **Play** starts the voice-over and CHIEF's timeline together. **Voice-over** off plays it silent.
- **Music** plays a score and sound effects synthesised in the page with Web Audio (no audio
  files, no licences), on the same clock as the scenes and about 10 dB under the voice: a lonely
  minor drone with a heartbeat, a riser into the beam, a warm chime for "Hi", a light pulse under
  the features (a friendly alert chime, a rising tone when CHIEF resolves it), a build through the
  body systems and a bright chord for the payoff. The plan is in `buildScore` in `index.html`.
- **Export video** (Chrome or Edge): the video fills the window, Chrome asks to share this tab
  (click **Share**), it plays once from the start and `chief-pitch-video.mp4` downloads when it
  ends (WebM if the browser cannot write MP4). `Esc` stops it early. The file is as sharp as the
  window is big: maximise it, or press `F11` first for the whole screen (1920 x 1080 on a 1080p
  monitor).
- **Full screen** or `F` shows only the stage, clean, to screen-record it; `Space` plays, `R`
  restarts, `Esc` exits.

CHIEF is the animator page embedded with `?embed` (only its transparent canvas); the storyboard
starts and stops its timeline with `postMessage`. Its positions and gestures are set in the
animator's timeline.
