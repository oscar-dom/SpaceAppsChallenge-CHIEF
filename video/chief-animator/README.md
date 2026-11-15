# CHIEF animator

A single web page that animates CHIEF for the demo video, so the mascot can present the app
as a voice-over plays. It draws the same mascot as the app
([`frontend/src/components/Capsule.vue`](../../frontend/src/components/Capsule.vue)): same
shapes and colours, light or dark theme. Only the eyes' expressions and the movement are
added. It exports a 1920 × 1080 video with a transparent (or green) background to lay over a
screen recording of the app.

Not part of the app: nothing in `frontend/` or `backend/` uses it.

## Open it

Open `index.html` in Chrome (double click works: it needs no server and no internet). If the
browser blocks something when opened from disk, serve the folder instead:

```bash
npx serve video/chief-animator
```

## What it does

**States** (buttons, or keys 1–9 for the first nine):

| State | What CHIEF does |
|---|---|
| `idle` | Floats and blinks every 5 s, as in the app |
| `talking` | Speech ripples rise from the top of the head, stronger with the voice; the eyes grow a little |
| `listening` | Taller eyes and the app's sound waves on the right |
| `thinking` | Eyes look up-right; three dots pulse, as in the app |
| `alert` | Suit and eyes turn amber, shakes, the app's "!" badge |
| `offline` | Grey, as in the app |
| `happy` | Happy `^ ^` eyes, bounces, swings the arms, two sparkles |
| `celebrate` | Arms up and waving, jumps and wiggles, sparkles around |
| `surprised` | Big eyes that pop, a little jump, arms out, pop lines above the head |
| `concerned` | Drooping eyelids, arms in, floats low and sways slowly |
| `sleepy` | Closed eyes, breathing, tilted, "Z Z Z" floating up |
| `scanning` | The eyes become one light sweeping across the visor |

**Gestures:** `wave`, `nod`, `spin` and `wink` play once; `point-left` and `point-right` hold
until the next cue (CHIEF also looks that way).

**Positions:** `center`, `left`, `right`, `top-left`, `top-right`, `bottom-left`,
`bottom-right`, and `off-left` / `off-right` to enter or leave the frame. CHIEF glides there,
leaning into the movement. The size slider scales it. A position can also be `X,Y`: the
pixel of the 1920 × 1080 frame where CHIEF's centre goes, to point at a spot of the app. A
cue at 0 s sets where CHIEF starts, with no glide (e.g. hidden off-right).

## Making the video

1. **Voice-over:** load the audio file in *Voice-over*. The current one is
   [`voiceover.mp3`](voiceover.mp3) (30.6 s; AI text-to-speech made with ElevenLabs, voice "Jessica"), and the page's default timeline is synced to it. While it plays in `talking`, CHIEF
   follows the voice.
2. **Timeline:** write one cue per line, matched to the script:

   ```
   seconds  state  position  gesture  "subtitle"
   1.6      talking  right   -        "Hi! I'm CHIEF, the health system of this spacecraft."
   ```

   `-` keeps the current value. Subtitles only help to rehearse: they are not recorded. The
   page comes with the cues for `voiceover.mp3`.
3. **Rehearse:** *Play timeline* plays the cues (and the voice, from the start). To frame
   CHIEF over the app, pick *App screenshot…* as the preview background.
4. **Record:** *Record WebM* plays the timeline and downloads `chief-2d-alpha.webm`
   (transparent background) when it ends. For editors that cannot read transparency, choose
   *Green screen* first and remove the green with a chroma key.
5. **Edit:** in DaVinci Resolve or CapCut, put the screen recording of the app (e.g. with
   OBS) on the bottom track, CHIEF's video on top, and the voice-over starting at 0 s, where
   the timeline starts.

*H* hides the side panel for a clean view.
