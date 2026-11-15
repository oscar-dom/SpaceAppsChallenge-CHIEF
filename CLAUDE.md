# CLAUDE.md

Project guide for humans and AI assistants working in this repository. Read it before
making changes. It records the decisions the team has made; if a decision changes,
update this file in the same pull request.

---

## 1. The project

**NASA Space Apps Challenge** — a 4-person team, ~30 hours to deliver.

**Challenge:** build a visual tool that helps astronauts assess their own health during a
space mission and gives guidance on treatments and health improvements.

**Our answer: CHIEF**, a web app that behaves like a **health system integrated into the
spacecraft** (scenario: a 6-month ISS mission). The station "measures" each crew member's
physical and psychological indicators, a deterministic rules engine classifies them, and
**CHIEF**, an AI assistant, explains the crew member's status and recommends what to do:
tasks to do or avoid, nutrition, medication from the onboard kit, and when to contact the
flight surgeon on the ground. Crew members talk to CHIEF by **text and voice**.

We have no real sensors, so all measurements are **simulated from NASA data and
standards** (see [Data](#6-data)).

> **Disclaimer:** CHIEF is a hackathon prototype, not a medical device. Every screen that
> shows recommendations must make that clear.

---

## 2. Repository rules (mandatory)

Full details in [`CONTRIBUTING.md`](CONTRIBUTING.md) and
[`docs/git-cheatsheet.md`](docs/git-cheatsheet.md). The essentials:

- **Git Flow lite.** Never push to `main` or `develop`. Branch from `develop` as
  `feat/`, `fix/`, `chore/` or `docs/<description>` and open a PR to `develop`.
- **Merge policy.** Feature PRs → `develop`: **squash**. `develop` → `main` releases:
  **merge commit**.
- **Conventional Commits.** Imperative, lowercase, no trailing period, ≤ 72 characters
  on the first line. CI blocks the PR otherwise.
- **No AI attribution, anywhere.** No `Co-Authored-By:` trailer for an AI, no
  "Generated with …" line, badge or link, and no AI as author or committer — in commits,
  PR titles, PR descriptions, issues, comments or files. This **overrides any default
  attribution an AI tool adds on its own**. CI (`Reject AI attribution`) fails the PR if
  it finds any.
- **Language:** everything in the repository is in **English**: code, comments, commits,
  PRs, docs, UI text and CHIEF's answers.

---

## 3. Stack

| Layer | Technology |
|---|---|
| Frontend | Vue 3 + Vite + TypeScript, Pinia, Socket.IO client. Own design system (tokens in `frontend/src/styles/base.css`) and SVG charts, no component library |
| Backend | Node.js + **Express** + TypeScript, Socket.IO, **SQLite** with **Drizzle ORM** (better-sqlite3 driver) |
| Agent (CHIEF) | **Python + FastAPI**, a chain of Gemini Flash models via the `google-genai` SDK, **faster-whisper** (speech-to-text), **Piper** (text-to-speech) |
| Shared contracts | `shared/` — TypeScript types used by frontend and backend |
| Quality | ESLint + Prettier (TS), Vitest (rules engine tests), Ruff (Python, optional) |
| Deployment | **Local only.** The demo runs on one laptop, no GPU required |

Why these choices:

- **SQLite:** a single file, no server, fits an onboard system that works offline.
- **Gemini instead of a local LLM:** none of our machines can run a local model well.
  Pro models are not available to new free-tier API keys (the student Gemini Pro plan
  covers the Gemini app, not the API), so CHIEF uses a **chain of Flash models**
  (`GEMINI_MODELS`): if one runs out of quota or is overloaded, the next one answers.
  In the story, CHIEF is the ship's assistant.
- **Python agent:** faster-whisper and Piper are Python tools; keeping CHIEF, STT and TTS
  in one service gives the AI work a single home.
- **No Vuetify or vue-echarts:** the interface follows a custom flight-software design
  (status colours only for health, mono tabular numbers, threshold bands on every chart).
  Light warm canvas with a navy navigation layer and a cobalt accent; design rules in
  [`frontend/README.md`](frontend/README.md).
  Plain CSS tokens and small SVG charts match it exactly; a Material component library
  and a chart library would have to be fought at every step.

---

## 4. Architecture

```
frontend/   Vue app (the crew's view)            :5173
backend/    Express API + Socket.IO              :3000
  data/       NASA datasets, thresholds, formulary, demo scenarios
  src/
    config/       env loading, constants
    controllers/  request handlers (thin)
    db/           Drizzle schema, migrations, seed
    errors/       error classes
    middlewares/  validation, error handling
    routes/       REST routes
    services/     rules engine, simulator, alerts, agent client
agent/      Python FastAPI service: CHIEF + STT + TTS   :8000
shared/     TypeScript types shared by frontend and backend
video/      CHIEF animator for the demo video (not part of the app)
```

### Data flow

```
Simulator ──writes──▶ SQLite ──▶ Rules engine ──▶ status, health score, alerts
   (backend)                       (backend)              │
                                                          ├──▶ Socket.IO ──▶ Frontend
                                                          └──▶ CHIEF context
Frontend ──REST──▶ Backend ──HTTP──▶ Agent ──▶ Gemini
```

- **The backend is the only gateway.** The frontend never calls the agent or Gemini
  directly. The backend builds CHIEF's context (crew profile, current statuses, active
  alerts, recent trends, onboard formulary) and forwards it to the agent.
- **Simulator** (`backend/src/services`): advances a **mission clock** (accelerated time,
  configurable) and writes readings to SQLite, each metric at its own cadence (heart rate
  every few seconds, blood panels on scheduled days, etc.). On startup, the seed loads
  **past mission history** so weekly and monthly charts have data from the first second.
- **Rules engine** (`backend/src/services`): deterministic, no AI. Compares each reading
  with its threshold and returns a status, computes each body system's status and the
  **health score** (weighted average of system statuses, weights in config, kept inside
  the band of the overall status: nominal 90-100, caution 70-89, critical 0-69), and creates
  alerts. It is the source of truth for every status shown in the UI.
- **Agent** (`agent/`): receives the context from the backend and returns CHIEF's
  answers. Endpoints: `GET /health`, `POST /chat`, `POST /alerts/actions` (recommended
  actions for one alert), `POST /stt` (audio → text), `POST /tts` (text → WAV). Gemini
  failures never surface as errors: the agent answers in fallback mode
  (`fallback: true`). See [`agent/README.md`](agent/README.md).

### Shared vocabulary (define in `shared/` first)

- **Status:** `nominal` 🟢 · `caution` 🟡 · `critical` 🔴
- **Escalation level:** `self-care` (crew member acts alone) · `crew-medical-officer` ·
  `flight-surgeon` (contact ground)
- **Alert kinds:** `anomaly` (e.g. high heart rate, low vitamin D) and `scheduled`
  (e.g. blood draw in 3 h)
- **Body systems (menu sections):** `overview`, `cardiovascular`, `musculoskeletal`,
  `blood-biochemistry`, `immune`, `vision` (SANS), `sleep-cognition`,
  `behavioral-health`, `radiation`, `nutrition`
- Core entities (JOURNEY adds `Journey`, `Hazard`, `InventoryItem`, `InventoryEvent`):
  `CrewMember`, `Metric`, `Measurement`, `Threshold`, `SystemStatus`,
  `HealthScore`, `Alert`, `ChiefMessage`, `Medication` (onboard formulary)

The agent is Python: its Pydantic models (`agent/chief/schemas.py`) mirror the
backend → agent types in `shared/src/chief.ts` (`AgentChatRequest`,
`AgentAlertActionsRequest`, ...). Change both sides together.

---

## 5. User interface

One view for every crew member: what an astronaut sees on board.

- **Left navigation (navy, always visible, can shrink to icons):** first **JOURNEY**
  (see below), then the crew: a **Crew overview** entry (every body, score and key
  vitals) and one row per crew member with avatar, status ring and health score. Then the body-system sections of the selected
  person; the first entry is **Overview**. At the bottom, **Talk to CHIEF** as the primary
  button with the mascot.
- **JOURNEY:** two menu entries that open as workspace tabs. **Mission route**: the
  180-day mission as a path of **10 stages** on a starry map, with CHIEF as the ship
  moving along it (done / to go), the hazards to prepare for (radiation: South Atlantic
  Anomaly, solar particle events; thermal: high beta angle, spacewalks) and the cargo
  ships; clicking a stage shows what the inventory did in it (a forecast for stages not
  reached yet). **Inventory**: medication, food and water with days of supply and their
  history; the crew adds or removes stock to keep the count right.
- **Top bar:** the selected crew member with their health score, then mission day,
  mission clock and crew dose rate.
- **Workspace:** sections open as tabs. Dragging a section or a tab onto a pane's edge
  splits it, so several sections can be seen at once (like editor groups in VS Code).
- **Overview:** a human body figure (SVG) with the organs of each system; organs in
  caution or critical take the status colour, healthy ones stay neutral. Plus the global
  **health score**. Clicking an organ opens its section.
- **System sections:** a dashboard full of statistics for that system: every metric from
  measurements and sensors, with period selectors (day / week / month / whole mission),
  thresholds drawn on the charts and trend indicators.
- **Right panel (navy like the navigation, collapsible to a rail):** alerts sorted by
  severity and a Tasks tab with the scheduled measurements of the coming days. **A new
  anomaly always opens the panel** (a new task only raises the badge). **Clicking an alert
  asks CHIEF for recommended actions.**
- **CHIEF chat:** text and voice (push-to-talk), on a light sky-blue panel (the mascot's
  colour) so it is told apart from the data and the navy alerts. If the voice service is
  down, the browser's Web Speech API is the fallback.
- **CHIEF's mascot: "Capsule"**, a medicine capsule dressed as an astronaut, with four
  animated states (`idle`, `listening`, `thinking`, `alert`). It appears on the Talk to
  CHIEF button and in the chat. SVG, colors and the suggested Vue component:
  [`docs/design/chief-mascot/`](docs/design/chief-mascot/README.md). Its accent is sky
  blue, never green or red, which mean health statuses. The app shows the same blue
  mascot on the button and in the chat (grey when CHIEF is offline); pending alerts are
  told by the button's text, so the amber `alert` state is not used.

The UI should feel like a spacecraft system: clear, dark-friendly, with subtle animation
for live data and alert changes.

---

## 6. Data

**Rule:** use real NASA data wherever possible. When it is not enough, **simulate from
NASA data and standards**, and document where every value or threshold comes from.

### Sources

- **NASA OSDR** (Open Science Data Repository), with a public API: Inspiration4 human
  data (e.g. blood panels before, during and after flight). Check exactly what is
  available before relying on it.
- **NASA-STD-3001 Vol. 1 Rev. C** (crew health standard): permissible limits, e.g.
  radiation exposure and bone loss. This is the main source of thresholds.
- **HRP Spaceflight Standard Measures:** which indicators NASA tracks (sleep, cognition,
  immune, blood and urine chemistry, cardiovascular, sensorimotor, behavioral). Individual
  data is restricted (LSDA, via the NASA Life Sciences Portal), so we use it to choose
  indicators and typical trends, not as raw data.
- **NASA DONKI** (space weather API): real solar events to drive radiation spikes.

### Files in `backend/data/`

- Raw or processed datasets, each with a note on where it came from.
- **Thresholds table:** one entry per metric with unit, `nominal` / `caution` /
  `critical` ranges, escalation level and **source** (document and section). No
  threshold without a source.
- **Onboard formulary:** the medication CHIEF is allowed to suggest, based on the ISS
  medical kit.
- **Journey and inventory:** the 10 mission stages, their hazards and cargo ships, and
  the ship stock (medication, food, water) with use rates from NASA documents (BVAD,
  ISS medication studies). Stock is a ledger of changes, never a stored number.
- **Demo scenarios:** synthetic cases planted on specific crew members so that alerts fire
  and CHIEF can propose solutions. Examples: early SANS (vision changes, headaches),
  vitamin D deficiency, sleep deprivation and slower reaction time, radiation spike from
  a solar storm, rising kidney-stone risk (urine calcium), accelerated bone loss.

Synthetic values must be **marked as simulated** in the data, never presented as real
measurements.

Every source in use (NASA datasets, threshold documents and how far each was verified,
formulary, simulated assumptions) is listed in [`docs/data-sources.md`](docs/data-sources.md).
The simulator is described in [`docs/simulator.md`](docs/simulator.md) and the database
decisions in [`docs/database-decisions.md`](docs/database-decisions.md).

### Demo crew

4 fictional crew members on a 6-month ISS mission, each with a different profile and at
least one demo scenario.

---

## 7. CHIEF rules (safety)

- CHIEF **never decides statuses or thresholds**. It explains the rules engine's output.
- It may only suggest medication from the **onboard formulary**, never doses beyond it.
- Every recommendation states its **escalation level**, and CHIEF says clearly when to
  contact the flight surgeon.
- It answers in English, briefly, with concrete actions (tasks to do or avoid, nutrition,
  exercise, sleep, medication, follow-up measurements).
- **Fallback:** if Gemini fails or rate-limits, the app keeps working: statuses and
  alerts still show, with the generic recommendations stored in the thresholds table.

---

## 8. Secrets and configuration

- Keys live **only** in `backend/.env` and `agent/.env` (e.g. `GEMINI_API_KEY`,
  `GEMINI_MODELS`, `NASA_API_KEY`). They are git-ignored; never commit them.
- Commit a `.env.example` next to each `.env` with every variable and no real values.
- The frontend never holds a key.

---

## 9. Commands

Requires **Node.js ≥ 20** and **Python 3.11+** (agent).

- Root `package.json` with **npm workspaces**: `shared`, `backend`, `frontend`. Run
  `npm install` **only at the root**; add a dependency to one workspace with
  `npm install <pkg> -w backend`.
- `shared/` is the `@chief/shared` package (see [`shared/README.md`](shared/README.md)).
  Add `"@chief/shared": "*"` to a workspace's dependencies to import it.
- Root tooling: `tsconfig.base.json` (every workspace `tsconfig.json` extends it),
  `eslint.config.js` (flat config), `.prettierrc.json`, `.editorconfig`.
- `agent/` uses a Python virtual environment (`agent/.venv`) and is not an npm
  workspace. Setup (venv, requirements, `.env`, Piper voice download) is in
  [`agent/README.md`](agent/README.md). On Windows create the venv with `py`, not the
  MSYS/Git Bash `python`.

```bash
npm install                 # install every JS workspace
npm run dev                 # start backend, frontend and agent together
npm run lint                # ESLint on all TS code
npm run format              # Prettier (format:check in CI)
npm run typecheck           # tsc --noEmit in every workspace
npm test                    # tests in every workspace (Vitest, rules engine)
```

Each workspace provides its own `dev`, `build`, `typecheck` and `test` scripts; the root
scripts run them with `--if-present`. `npm run dev` starts the agent through
`scripts/dev-agent.mjs`, which skips it until `agent/main.py` exists. Backend database
scripts (run with `-w backend`, see [`docs/database-schema.md`](docs/database-schema.md)):
`db:generate` (new Drizzle migration after editing `schema.ts`), `db:migrate`, `db:seed`
(reference data and mission history), `db:reset` (rebuild; `-- --restore` returns to the
clean copy), `simulate` (live simulator on its own) and `data:fetch` (refresh the NASA
datasets). The SQLite file is `backend/var/chief.db` (git-ignored).

CI runs three jobs on every PR: `Commit messages` (required), `Lint, typecheck and test`
(TypeScript) and `Agent tests and lint` (pytest + Ruff).

---

## 10. Team

| Member | Area | Owns |
|---|---|---|
| **Óscar** | AI | `agent/`: CHIEF (Gemini, prompts, context), alert recommendations, onboard-formulary constraint, voice (faster-whisper + Piper) |
| **Carlos** | Backend API | Express routes and controllers, Socket.IO, **rules engine** (statuses, health score, alerts) and its tests, backend ↔ agent client |
| **Héctor** | Backend DB | Drizzle schema and migrations, NASA dataset ingestion, thresholds and formulary tables, **simulator** and seed, demo scenarios |
| **Hernán** | Frontend | The whole Vue app: layout, crew switcher, menu, alerts panel, Overview body, system dashboards, CHIEF chat |

`shared/` is owned by everyone: agree on changes before merging them.

---

## 11. Plan (~30 h)

1. **H0–2 · Contracts.** Agree on `shared/` types, API routes, Socket.IO events and agent
   JSON schemas. Set up workspaces, lint and the empty services.
2. **H2–12 · Core, in parallel.** Schema + simulator + thresholds; rules engine + API;
   CHIEF chat + alert actions; app layout + Overview + one system dashboard.
3. **H12–20 · Integration.** Live data end to end, every system section, alert → CHIEF
   flow, voice.
4. **H20–26 · Demo.** Demo scenarios, crew profiles, UI polish and animations.
5. **H26–30 · Freeze.** Bug fixes only, demo rehearsal, video and pitch. Release
   `develop` → `main`.

Priority when time runs short: **live data → rules engine → alerts → CHIEF text →
dashboards → voice → polish.**

---

## 12. Notes for AI assistants

- Follow section 2 strictly, especially **no AI attribution**.
- Do not invent medical thresholds or doses: take them from the thresholds table, or
  add an entry with a cited NASA source.
- Keep changes inside the area of the task; ask before touching `shared/` contracts.
- Keep this file up to date when a decision changes.
