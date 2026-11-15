# Space Apps project submission

The text for each field of the NASA Space Apps **Project page**, ready to copy into the form
(*My Team → Project → Edit*). Fields follow the order of the
[Project Submission Guide](https://www.spaceappschallenge.org/resources/project-submission-guide/#navigating-the-hackathon-project-submission).
Everything on the form must be in English.

## Before submitting

- [ ] **Make the repository public** (it is private now): the judges must open every link with
      no login, permission or registration. Check the history has no secrets before.
- [ ] **Upload the demo video** (30 s or less, English, AI watermark visible) to YouTube,
      Google Drive or similar, set it to public, and paste the link below.
- [ ] **Release `develop` to `main`**, so the repository's default branch shows the final work.
- [ ] Open both links in a private window to check they work.
- [ ] Add images to the Project page (JPG, PNG or GIF up to 10 MB): the banner and the
      screenshots in [`video/screenshots/`](../video/screenshots/).
- [ ] All team members confirmed at the same Local Event.
- [ ] Tick *Terms and Conditions* and *Confirm All Work is Original*, then **Submit for
      Judging** before **Sunday 15 November, 23:59** (local time of the Local Event). It can be
      edited and resubmitted until then; the last save is judged.

## Team

| Member | Area | Technologies |
| --- | --- | --- |
| **Óscar Domínguez Álvarez** | AI assistant (CHIEF): LLM orchestration, clinical context, safety guardrails, speech-to-text and text-to-speech · Frontend UX: design system, body map, JOURNEY views · Demo video | Python, FastAPI, Pydantic, Google Gemini API, faster-whisper, Piper · Vue 3, TypeScript, SVG · HTML Canvas |
| **Carlos Gonzalez Marcos** | Backend: REST API, real-time updates, rules engine (statuses, health score, alerts), agent integration · Demo video | Node.js, Express, TypeScript, Socket.IO, Zod, Vitest |
| **Héctor San Cecilio Martín** | Data and simulation: database schema, NASA dataset ingestion, sourced thresholds, mission simulator, demo scenarios · Frontend UX: workspace windows, pane splitting and layout limits · Demo video | SQLite, Drizzle ORM, TypeScript, NASA OSDR and DONKI APIs · Vue 3, Pinia |
| **Hernán Platero Domínguez** | Frontend: application layout, crew navigation, dashboards and charts, alerts panel, chat | Vue 3, Vite, TypeScript, Pinia, Socket.IO client, SVG |

---

## Project Name

```
CHIEF: the health system a spacecraft could carry
```

## High-Level Project Summary

```
CHIEF is a crew health system for a six-month ISS mission, built as if it were part of the spacecraft. The station "measures" 25 physical and psychological indicators of each astronaut across 9 body systems; a deterministic rules engine compares every reading with a threshold taken from NASA standards (NASA-STD-3001, JSC-67378, OCHMO) or cited clinical guidelines, and turns them into a status, a health score and alerts. CHIEF, an AI assistant the crew can talk to by text or voice, explains in plain words what is wrong and what to do: tasks to avoid, nutrition, medication from the onboard kit only, and when to call the flight surgeon. A mission route view plans ahead: the radiation and thermal hazards of the coming weeks, including a replay of the real May 2024 solar storm from NASA DONKI, and the food, water and medication left on board.

It answers the challenge directly: astronauts see their own health at a glance and get guidance on treatment and improvement. It matters because, as missions go farther from Earth, crews can no longer rely on instant help from the ground. CHIEF gives them autonomy, while the AI never decides a status and every recommendation is grounded in NASA science.
```

## Link to Project Demo

```
<public link to the 30-second video: YouTube / Google Drive>
```

The video is built in [`video/storyboard/`](../video/storyboard/) (export: *Export video*); it
carries the *AI-generated* watermark.

## Link to Final Project

```
https://github.com/oscar-dom/SpaceAppsChallenge-CHIEF
```

Only once the repository is public. The README explains how to run it in one command and gives
a three-minute tour.

## Detailed Project Description

```
WHAT IT DOES
CHIEF is the health system of a simulated six-month ISS mission with four crew members. It shows:
- Crew overview: every astronaut's body map, health score and key vitals at a glance. Organs take a colour only when a body system is in caution or critical, following control-room (ISA-101) practice, so problems stand out.
- Per-astronaut dashboards for 9 body systems (cardiovascular, musculoskeletal, blood and biochemistry, immune, vision/SANS, sleep and cognition, behavioral health, radiation, nutrition): 25 indicators with day, week, month and whole-mission charts, threshold bands, trends, the spaceflight effect behind each metric and the source of each threshold. A workspace with split panes lets the crew compare systems side by side.
- Alerts sorted by severity, each with who must act (self-care, crew medical officer or flight surgeon), and scheduled measurements for the coming days.
- CHIEF, an AI assistant (text and push-to-talk voice) that explains the crew member's status and recommends concrete actions: tasks to do or avoid, nutrition, exercise, sleep, medication from the onboard formulary only, follow-up measurements, and when to contact the flight surgeon.
- JOURNEY: the mission as a route in 10 stages, with CHIEF as the ship, the radiation and thermal hazards ahead (South Atlantic Anomaly passes, a replay of the real May 2024 solar storm, high beta angle periods, spacewalks) with what to do for each, and the cargo ships; plus the ship's inventory of food, water and medication with days of supply, history, forecasts and crew adjustments.

HOW IT WORKS
- Simulator: a mission clock running 600 times faster than real time writes each indicator at its own cadence, with realistic noise and spaceflight trends (bone loss, fluid shift, sleep disruption, radiation). Real NASA OSDR preflight blood values of the Inspiration4 crew are used as baselines. Demo scenarios are planted so that meaningful alerts appear: vitamin D deficiency, early SANS, sleep deprivation, rising kidney-stone risk, accelerated bone loss and a solar storm.
- Rules engine: deterministic and unit tested. Every metric has a threshold with a cited source; the worst metric sets the system status, the worst system sets the crew member's status, and a weighted health score is kept inside the band of that status. It is the single source of truth for every colour on screen.
- CHIEF agent: the backend sends it the crew member's profile, statuses, active alerts, trends and the onboard formulary. It answers with a chain of language models (if one is over quota or slow, the next one answers within a 15-second budget). If all fail, it answers in fallback mode with the sourced recommendations of the thresholds table, so the crew is never left without guidance.
- Voice: speech-to-text and text-to-speech run locally on a laptop CPU.
- Inventory: daily use of food (1.83 kg per crew member) and water (2.5 kg, 98% reclaimed) comes from NASA's Life Support Baseline Values; medication use follows ISS medication studies; three cargo ships resupply the station.

BENEFITS
- Autonomy: astronauts understand their own health and act early, without waiting for the ground.
- Safety by design: the AI never decides a status or a threshold; it can only suggest medication from the onboard formulary; every recommendation states its escalation level; simulated values are labelled as such; a disclaimer is on every screen.
- Always available: statuses, alerts and sourced recommendations keep working without the AI or the internet. Everything except the language model runs on one laptop, without a GPU.
- Planning ahead: hazards and supplies are visible weeks in advance.

WHAT WE HOPE TO ACHIEVE
A health system that a spacecraft could carry for missions where Earth is far away, and that could also serve people far from a doctor on Earth: polar stations, ships, offshore platforms and remote clinics.

TOOLS
- Interface: Vue 3, TypeScript, Vite, Pinia, Socket.IO client, hand-drawn SVG charts and body maps.
- Backend: Node.js, Express, TypeScript, Socket.IO, SQLite with Drizzle ORM, Vitest.
- AI agent: Python, FastAPI, Google Gemini (google-genai), faster-whisper (speech-to-text), Piper (text-to-speech).
- Quality: 164 automated tests, ESLint, Prettier, Ruff, GitHub Actions continuous integration.
- Runs locally with one command (npm start, start.sh or start.cmd).
```

## Use of Super Intelligence (SI)

> For data collection only: the judges do not see this answer, but they do see the watermarks
> and notes in the project. **Review and complete it with what each team member actually
> used.**

```
Yes.
- In the product: CHIEF, the in-app assistant, uses a large language model (Google Gemini) to explain the rules engine's results and suggest actions, within safety limits (it never decides statuses, it only suggests medication from the onboard formulary). Speech recognition (Whisper) and speech synthesis (Piper) are machine-learning models running locally. The project text and the README state this.
- In development: we used AI assistants to speed up writing code, tests and documentation, and to explore interface designs. The idea, the approach to the challenge, the architecture, the safety rules and the choice of NASA sources are the team's; every change was reviewed by the team.
- In the demo video: the voice-over and the mascot's animation are AI-generated; the video carries a visible "AI-generated" watermark.
No NASA logos or branding are used in generated content.
```

## NASA Data

```
- NASA Open Science Data Repository (OSDR), Inspiration4: OSD-569 (complete blood count) and OSD-575 (comprehensive metabolic panel). Real preflight white blood cell counts and glucose of the four crew members, used as their baselines and to set a reference interval. https://osdr.nasa.gov/bio/repo/data/studies/OSD-569
- NASA DONKI (Space Weather Database Of Notifications, Knowledge, Information, via api.nasa.gov): solar energetic particle events and geomagnetic storms of May 2024. The real timing of the proton onsets is replayed as a radiation spike on board and shown on the mission route. https://api.nasa.gov/
- NASA-STD-3001 Vol. 1 Rev. C, via the NASA OCHMO radiation protection technical brief: career radiation limit (600 mSv). https://www.nasa.gov/wp-content/uploads/2023/03/radiation-protection-technical-brief-ochmo.pdf
- NASA OCHMO Bone Loss technical brief: bone mineral density targets. https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-030-bone-loss.pdf
- NASA JSC-67378 Rev. 1, Nutritional Requirements for Exploration Missions (2020): calcium, fluid and energy intake. https://ntrs.nasa.gov/citations/20205008306
- NASA JSC clinical decision flow for vitamin D. https://ntrs.nasa.gov/citations/20130013531
- NASA Human Research Program Spaceflight Standard Measures: which indicators to track (sleep, cognition, immune, blood and urine chemistry, cardiovascular, behavioral).
- NASA Life Support Baseline Values and Assumptions Document (BVAD), NASA/TP-2015-218570/REV1: daily food (1.83 kg) and potable water (2.5 kg) per crew member. https://ntrs.nasa.gov/citations/20180001338
- NASA, ISS water recovery milestone (2023): 98% of the water used is reclaimed. https://www.nasa.gov/missions/station/iss-research/nasa-achieves-water-recovery-milestone-on-international-space-station/
- NASA ISS Medical Kit Checklist: the onboard formulary, the only medication CHIEF may suggest. https://www.nasa.gov/wp-content/uploads/2015/03/medical_kit_checklist_-_full_release.pdf
- NASA Technical Reports Server: space motion sickness incidence and treatment (NTRS 20110020471), radiation exposure in the South Atlantic Anomaly (NTRS 20040152077), external thermal environment of the ISS (NTRS 20180004474).
- NASA, International Space Station visiting vehicles: the cargo ships and their cadence. https://www.nasa.gov/international-space-station/space-station-visiting-vehicles/
Every source, and how far each threshold was verified, is listed in docs/data-sources.md of the repository.
```

## Space Agency Partner Data and Other References

```
Space Agency Partner data: none used directly. The fictional crew includes ESA astronauts.

Scientific and clinical references (thresholds where NASA sets none, each cited in the app):
- WHO Pulse Oximetry Training Manual (2011), via the PhenX protocol: blood oxygen saturation.
- 2017 ACC/AHA Guideline for High Blood Pressure in Adults: blood pressure.
- American Heart Association (via Mayo Clinic): resting heart rate.
- American Diabetes Association: fasting glucose.
- AASM and Sleep Research Society consensus (2015): sleep duration. https://pmc.ncbi.nlm.nih.gov/articles/PMC4434546/
- National Sleep Foundation sleep quality recommendations (Ohayon et al., 2017): sleep efficiency.
- CDC/AHA statement on C-reactive protein; hypercalciuria review (PubMed 28846247): urine calcium; ophthalmology references for intraocular pressure; Frisén scale for optic disc edema (Frisén, 1982).
- Wotring VE, Medication use by U.S. crewmembers on the ISS, FASEB J 2015. https://doi.org/10.1096/fj.14-264838
- Barger LK et al., Sleep deficiency and hypnotic use in astronauts, Lancet Neurol 2014. https://pmc.ncbi.nlm.nih.gov/articles/PMC4188436/
- AMS-02 collaboration, ISS thermal operations (beta angle). https://ams02.space/de/node/489
- NOAA Space Weather Scales (solar radiation storms). https://www.spaceweather.gov/node/415
- ISS medication list (NASA, FOIA), reproduced by WikEM.

Images and design assets:
- Body outlines adapted from react-native-body-highlighter 3.2.0 (MIT License). https://github.com/HichamELBSI/react-native-body-highlighter
- Organ icons from Health Icons (public domain, CC0 1.0). https://healthicons.org
- IBM Plex Sans and IBM Plex Mono fonts (SIL Open Font License).
- The CHIEF mascot, the interface and all other graphics are our own.

Software and models (open source):
Vue 3, Vite, Pinia, TypeScript, Node.js, Express, Socket.IO, SQLite, better-sqlite3, Drizzle ORM, Zod, Pino, Vitest, Python, FastAPI, Pydantic, Uvicorn, google-genai (Google Gemini API), faster-whisper (OpenAI Whisper model), Piper text-to-speech with the en_US-ryan-medium voice, ESLint, Prettier, Ruff, GitHub Actions.
```
