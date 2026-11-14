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
┌ TopBar: mission day · mission clock · crew dose rate · layouts · theme ──────────────┐
├ CrewTabs: Crew (whole crew) │ Ana │ Leo │ Sara │ Iker ─────────────────────────────────┤
│ NavPanel   │ Workspace: panes of tabs, split by drag and drop      │ Chat │ Alerts   │
│ sections   │ (Crew overview · Overview · one dashboard per system) │      │ / Tasks  │
│ Talk to    │                                                       │      │ (rail    │
│ CHIEF      │                                                       │      │ when     │
│ (bubble)   │                                                       │      │ closed)  │
└ Status bar: last evaluation · CHIEF online/offline · panes · disclaimer ─────────────┘
```

- **Workspace:** a tree of splits and panes (`src/lib/layout.ts`, pure and tested). Click a
  section to open it in the focused pane; drag a section or a tab onto a pane edge to split
  it, onto its centre or tab bar to move it there. Dividers resize the panes.
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
| `src/layout/` | App shell: top bar, crew tabs, left panel, workspace and panes, chat, notifications |
| `src/views/` | Crew overview, crew member overview, system dashboard |
| `src/components/` | Body map, Capsule mascot, metric card and chart, alert card, chips |
| `src/lib/` | Pure helpers: statuses and thresholds, sections, layout tree, formatting, icons |
| `src/styles/base.css` | Design tokens (dark and light) and shared classes |

## Design rules

- Status colours (green, amber, red, grey) mean **health status only**; the sky-blue accent
  marks selection, focus and actions. Status is always shown with a dot and a label.
- Numbers, units and times use IBM Plex Mono with tabular figures.
- Metrics without a sourced threshold are drawn as **Charted only**, never as nominal.
- Every chart draws the nominal band and the caution and critical cut-offs of its threshold,
  with the threshold's source underneath.
- Live data: one Socket.IO connection per crew member (the backend sends each member's
  readings, health and alerts to its own room).
