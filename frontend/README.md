# `frontend/`: the crew's interface

Vue 3 + Vite + TypeScript + Pinia. What an astronaut sees on board: the crew overview, each
crew member's body map and health score, a dashboard per body system, the alerts panel and
the CHIEF chat. All data comes from the backend (`/api` and Socket.IO); the frontend never
calls the agent or Gemini.

## Run it

From the repository root, with the backend running (`npm run dev` starts everything):

```bash
npm run dev -w frontend      # http://localhost:5173
npm run typecheck -w frontend
npm test -w frontend         # workspace layout tests (Vitest)
npm run build -w frontend
```

The dev server proxies `/api` and `/socket.io` to `http://localhost:3000`. Copy
`.env.example` to `.env` only to point it at another backend (`VITE_BACKEND_URL`).

## Layout

```
┌ NavPanel ──┬ TopBar: selected person + score · mission day · clock · dose · layouts ─┐
│ (navy)     ├────────────────────────────────────────────────────────┬──────┬──────────┤
│ Crew       │ Workspace: panes of tabs, split by drag and drop      │ Chat │ Alerts   │
│  overview  │ (Crew overview · Overview · one dashboard per system) │      │ / Tasks  │
│  4 people  │                                                       │      │ (rail    │
│ Health     │                                                       │      │ when     │
│  systems   │                                                       │      │ closed)  │
│ Talk to    ├ Status bar: last evaluation · CHIEF online/offline · panes · disclaimer ─┤
└ CHIEF ─────┴──────────────────────────────────────────────────────────────────────────┘
```

- **Navigation (NavPanel):** who, then what: the crew overview and one row per person
  (avatar with a status ring, role, score), then the health systems of the selected person
  (systems in caution or critical get a status label), then **Talk to CHIEF** as the
  primary button. It shrinks to an icon rail.
- **Top bar:** names the person the workspace is showing, with the health score, so the
  context is never in doubt.
- **Workspace:** a tree of splits and panes (`src/lib/layout.ts`, pure and tested). Click a
  section to open it in the focused pane; drag a section or a tab onto a pane edge to split
  it, onto its centre or tab bar to move it there. The **Split right** button in a pane's
  header opens its active tab again in a new pane to the right. Dividers resize the panes.
  A pane never gets smaller than 380 × 280 px: a drag split is only offered when both
  halves keep that size, there are at most 4 panes, dividers stop at the minimum, and when
  the window is too small for the layout the workspace scrolls instead of squeezing the
  panes. The Split right button does not check the pane limit or the minimum width.
- **Notifications:** alerts (anomalies) and tasks (scheduled measurements). The panel
  collapses to a rail, but a new alert from the backend always opens it again.
- **CHIEF chat:** text and push-to-talk. The recording goes to `/api/chief/stt`; if the
  voice service fails, the browser's Web Speech API transcript is used. Answers to voice
  questions are read aloud (`/api/chief/tts`, or the browser's speech synthesis). When the
  backend answers in fallback mode, the chat shows the standard recommendations of the
  thresholds table.

## Code

| Folder | Contents |
| --- | --- |
| `src/api/` | REST client for the backend |
| `src/stores/` | `mission` (data and live sockets), `workspace` (layout), `ui` (panels), `chief` (chat, alert actions, voice) |
| `src/layout/` | App shell: navigation, top bar, workspace and panes, chat, notifications |
| `src/views/` | Crew overview, crew member overview, system dashboard |
| `src/components/` | Body map, Capsule mascot, metric card and chart, alert card, chips |
| `src/lib/` | Pure helpers: statuses and thresholds, sections, layout tree, formatting, icons |
| `src/styles/base.css` | Design tokens (light by default, dark) and shared classes |

## Design rules

- **Two layers.** Data sits on a warm off-white canvas with white cards: dense numbers read
  best dark on light, and a warm neutral glares less than pure white. Navigation sits on a
  deep navy layer, so who and where are found at a glance and never mix with the data.
- **Colour is for state.** Green, amber and red mean **health status only**, so menus and
  buttons use a cobalt blue accent (selection, focus, primary actions, links), never green.
  Following high-performance HMI practice (ISA-101), nominal things stay neutral and only
  caution and critical take a status colour, so a problem stands out at once. Status is
  always shown with a dot and a label, never colour alone.
- **People first.** Crew members are the subject: large avatars with a status ring in the
  navigation, one card per person on the crew overview, the selected person named in the
  top bar.
- **Body map.** A soft mannequin (about 8 heads tall, male and female proportions) with
  the organs of each system: brain (sleep, cognition, behaviour), eyes (vision), lungs and
  heart, stomach (nutrition), kidneys (blood biochemistry), lymph nodes (immune), long
  bones (musculoskeletal). Healthy organs stay neutral, abnormal ones take the status
  colour and critical ones pulse. Radiation is the body outline plus a dosimeter badge.
- Numbers, units and times use IBM Plex Mono with tabular figures.
- Metrics without a sourced threshold are drawn as **Charted only**, never as nominal.
- Every chart draws the nominal band and the caution and critical cut-offs of its threshold,
  with the threshold's source underneath.
- Live data: one Socket.IO connection per crew member (the backend sends each member's
  readings, health and alerts to its own room).
