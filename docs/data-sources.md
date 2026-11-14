# CHIEF: data sources

Every value CHIEF shows is either a **real NASA measurement**, a **threshold taken from a cited document**, or a **simulated value** marked as such. This document lists every source the backend uses, what was taken from it, where it lives in the code, and how far it was verified.

Rule from [`CLAUDE.md`](../CLAUDE.md): use real NASA data wherever possible; when it is not enough, simulate from NASA data and standards, and document where every value comes from. No threshold without a source, no dose CHIEF may suggest beyond the formulary.

Related documents: [database](database-schema.md), [simulator](simulator.md), [database decision log](database-decisions.md).

## Summary

| Source | Kind | Used for | Code |
| --- | --- | --- | --- |
| NASA OSDR, Inspiration4 (OSD-569, OSD-575) | Real dataset | Preflight white blood cell count and glucose of C001–C004; simulator baselines; white blood cell reference interval | `backend/data/datasets/osdr-inspiration4-blood.json`, `datasets.ts`, `thresholds.ts` |
| NASA DONKI | Real dataset | Timing of the May 2024 solar storm, replayed by the solar-storm scenario | `backend/data/datasets/donki-may-2024-storm.json`, `scenarios.ts` |
| NASA-STD-3001 Vol. 1 Rev. C (via the OCHMO radiation brief) | NASA standard | Career radiation limit (600 mSv) | `thresholds.ts` |
| NASA OCHMO Bone Loss technical brief | NASA standard | Bone mineral density targets (≥ 95 % hip/spine, ≥ 90 % femoral neck) | `thresholds.ts` |
| NASA JSC-67378 Rev. 1 (2020) | NASA requirement | Calcium and fluid intake | `thresholds.ts`, `simulation.ts` |
| NASA JSC clinical decision flow (vitamin D) | NASA document | Vitamin D deficiency and insufficiency | `thresholds.ts` |
| NASA ISS Medical Kit Checklist and ISS medication list (FOIA) | NASA document | Onboard formulary | `formulary.ts` |
| HRP Spaceflight Standard Measures | NASA programme | Which indicators to track (not raw data) | `metrics.ts` |
| Clinical guidelines (AHA, ACC/AHA, ADA, AASM/SRS, NSF, CDC/AHA, WHO, hypercalciuria review, ophthalmology reference, Frisén scale) | Public guidelines | Thresholds where NASA sets none | `thresholds.ts` |
| NOAA Space Weather Scales | Public scale | Proposed trigger for the solar-storm alert (not implemented) | — |

## Real datasets

Both datasets are downloaded and trimmed by `npm run data:fetch -w backend` ([`backend/scripts/fetch-nasa-data.ts`](../backend/scripts/fetch-nasa-data.ts)) and the processed files are committed, so the demo works offline. Each file records its source and retrieval date.

### NASA OSDR: Inspiration4 blood panels

- **What:** the Open Science Data Repository publishes clinical blood tests of the four anonymous Inspiration4 crew members (codes C001–C004), taken before and after their 3-day flight in 2021.
- **Files downloaded:**
  - OSD-569, `LSDS-7_Complete_Blood_Count_CBC_TRANSFORMED.csv` (complete blood count): column `white_blood_cell_count_value_thousand_per_microliter`.
  - OSD-575, `LSDS-8_Comprehensive_Metabolic_Panel_CMP_TRANSFORMED.csv` (metabolic panel): column `glucose_value_milligram_per_deciliter`.
  - Download URL pattern: `https://osdr.nasa.gov/geode-py/ws/studies/<OSD>/download?source=datamanager&file=<file>`. File listings: `https://osdr.nasa.gov/osdr/data/osd/files/569` and `/575`.
- **Timepoints:** L-92, L-44, L-3 (days before launch) and R+1, R+45, R+82, R+194 (days after return). The processed file stores `daysFromLaunch`, with return timepoints as 3 + n because the flight lasted 3 days.
- **Retrieved:** 2026-11-14 (`retrievedAt` in the file).

**How CHIEF uses it**

1. The 3 **preflight** samples of each crew member are stored as **real readings** (`simulated = false`), placed the same number of days before this mission's start (e.g. L-92 → 92 days before 2026-09-01, at 09:00 UTC). 24 readings: 4 crew × 3 timepoints × 2 metrics.
2. Their **mean** is the baseline from which the simulator generates in-flight values for each crew member:

| Crew | White blood cells L-92 / L-44 / L-3 (×10³/µL) | Baseline | Glucose L-92 / L-44 / L-3 (mg/dL) | Baseline |
| --- | --- | --- | --- | --- |
| C001 | 5.4 / 5.5 / 7.0 | 5.97 | 83 / 80 / 69 | 77.3 |
| C002 | 6.5 / 5.4 / 7.2 | 6.37 | 69 / 72 / 78 | 73.0 |
| C003 | 9.6 / 9.3 / 9.8 | 9.57 | 77 / 62 / 75 | 71.3 |
| C004 | 7.7 / 6.4 / 10.6 | 8.23 | 100 / 83 / 56 | 79.7 |

3. The **reference interval** the laboratory reported with the blood count (3.8–10.8 ×10³/µL) is the source of the white blood cell threshold.

**Caveats and data not used**

- Inspiration4 lasted 3 days, so there is no 6-month in-flight data: the evolution during our mission stays simulated. Postflight timepoints are kept in the file but not imported, because they would fall after our simulated mission.
- Our crew members are fictional. They reuse the anonymous OSDR codes, but their names, roles and sexes are made up; real data must never be tied to real people.
- The metabolic panel is not labelled as fasting; it is stored under `fasting-glucose` as the closest metric. One real value (C004, L-3: 56 mg/dL) falls in the hypoglycemia band, which is why the glucose threshold has a low caution band.
- **C-reactive protein** from OSD-575 (`LSDS-8_Multiplex_serum_cardiovascular_EvePanel`) was inspected but **not used**: it comes from a research multiplex immunoassay (Eve Technologies), with values of 1.3–83.6 mg/L, which are not comparable to the clinical hs-CRP threshold.
- **Hemoglobin** (in the blood count) was not used: its reference ranges are sex-specific and our crew's sexes are fictional, so they would not match.

### NASA DONKI: May 2024 solar storm

- **What:** the Space Weather Database Of Notifications, Knowledge, Information (CCMC, NASA Goddard) lists solar events. Accessed through `https://api.nasa.gov/DONKI/`.
- **Endpoints:** `SEP` (solar energetic particle events) and `GST` (geomagnetic storms), window 2024-05-01 to 2024-06-29. The API allows at most 60 days per request. The flare endpoint (`FLR`) returned 404 for this window and is not used.
- **Filtering:** only proton detections by GOES (`>10 MeV` and `>100 MeV` channels) are kept as event onsets; model runs and other spacecraft are dropped.
- **Retrieved:** 2026-11-14.

| Onset (UTC) | Instrument | Used in the storm replay |
| --- | --- | --- |
| 2024-05-10 13:35 | GOES-P SEISS >10 MeV | yes (first onset) |
| 2024-05-11 02:10 | GOES-P SEISS >100 MeV | yes (+0.52 days) |
| 2024-05-13 14:00 | GOES-P SEISS >10 MeV | yes (+3.02 days) |
| 2024-06-08 02:25 | GOES-P SEISS >100 MeV | no (more than 7 days later) |
| 2024-06-08 02:55 | GOES-P SEISS >10 MeV | no |

The file also keeps the geomagnetic storms with their Kp index (peak Kp 9.0 on 10–11 May 2024).

**How CHIEF uses it:** the `solar-storm` scenario replays the **real timing** of the three May proton onsets. In the seeded history the first onset falls on mission day 56.3; live, it starts at the current simulated time. The **size** of the dose-rate increase on board (+40 µSv/h for a >10 MeV onset, +80 µSv/h for >100 MeV, fading with a 10-hour time constant) is a **simulated assumption**: DONKI gives no dose on board.

**API key:** `NASA_API_KEY` in `backend/.env` (free at api.nasa.gov, see `backend/.env.example`). Without it the script uses `DEMO_KEY`, which is rate limited: a second run on 2026-11-14 got HTTP 429 and kept the file from the first run.

## Thresholds

Full entries, with their fallback recommendations, are in [`backend/data/thresholds.ts`](../backend/data/thresholds.ts). Ranges use the contract's rule: inclusive minimum, exclusive maximum, and a value outside every range is critical.

| Metric | Nominal | Caution | Critical | Source | Verification |
| --- | --- | --- | --- | --- | --- |
| Resting heart rate | 60–100 bpm | 50–60, 100–120 *(team band)* | < 50, ≥ 120 | AHA, quoted by [Mayo Clinic](https://www.mayoclinic.org/healthy-lifestyle/fitness/expert-answers/heart-rate) | verified |
| Blood oxygen saturation | ≥ 95 % | 90–95 % | < 90 % | WHO Pulse Oximetry Training Manual (2011), quoted verbatim by the [PhenX protocol](https://www.phenxtoolkit.org/protocols/view/91102) and the WHO slide set | verified |
| Systolic blood pressure | < 120 | 120–140 (elevated, stage 1) | ≥ 140 (stage 2) | 2017 ACC/AHA hypertension guideline | verified |
| Diastolic blood pressure | < 80 | 80–90 (stage 1) | ≥ 90 (stage 2) | 2017 ACC/AHA hypertension guideline | verified |
| Bone mineral density change | ≥ −5 % | −10 to −5 % | < −10 % | NASA-STD-3001 Vol. 1 Rev. C, requirement **V1 4027** (Pre-mission Bone Countermeasures): hip/spine ≥ 95 %, femoral neck ≥ 90 % of pre-mission, quoted in the [NASA OCHMO Bone Loss brief](https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-030-bone-loss.pdf) (OCHMO-MTB-013 Rev D) | verified |
| Vitamin D (25-OH) | ≥ 30 ng/mL | 20–30 (insufficiency) | < 20 (deficiency) | [NASA JSC clinical decision flow](https://ntrs.nasa.gov/citations/20130013531) | verified |
| Urine calcium | < 250 mg/day | 250–300 | ≥ 300 | [Hypercalciuria review, PubMed 28846247](https://pubmed.ncbi.nlm.nih.gov/28846247/) (> 250 women, 275–300 men); StatPearls (normal < 250) | verified |
| Fasting glucose | 70–100 mg/dL | 100–126 (prediabetes), 54–70 (level 1 hypoglycemia) | ≥ 126, < 54 | ADA Standards of Care (classification of hypoglycemia: level 1 < 70 and ≥ 54, level 2 < 54 mg/dL) | verified |
| White blood cell count | 3.8–10.8 ×10³/µL | 3.0–3.8, 10.8–13 *(team band)* | < 3.0, ≥ 13 | Inspiration4 lab reference interval, [NASA OSDR OSD-569](https://osdr.nasa.gov/bio/repo/data/studies/OSD-569) | verified |
| C-reactive protein | < 3 mg/L | 3–10 (high risk) | ≥ 10 | CDC/AHA statement, Pearson et al., Circulation 2003;107:499-511 (persistent, unexplained > 10 mg/L: look for non-cardiovascular causes) | verified (> 10 mg/L quoted by CAP and LabCorp) |
| Optic disc edema grade | 0 | 1–2 *(team band)* | ≥ 3 | Frisén L., J Neurol Neurosurg Psychiatry 1982;45:13-18: grades 0 normal, 1 very early, 2 early, 3 moderate, 4 marked, 5 severe | verified (grades); the status mapping is a team band |
| Intraocular pressure | 10–21 mmHg | < 10, 22–26 *(team band)* | ≥ 26 | Ophthalmology reference (normal 10–21; ocular hypertension > 21) | verified |
| Sleep duration | ≥ 7 h | 6–7 h *(team band)* | < 6 h | [AASM/SRS consensus 2015](https://pmc.ncbi.nlm.nih.gov/articles/PMC4434546/) | verified |
| Sleep efficiency | ≥ 85 % | 75–85 % (NSF "uncertain") | < 75 % | NSF sleep quality recommendations, Ohayon et al., Sleep Health 2017;3(1):6-19: adults 26–64, ≥ 85 % good quality, ≤ 74 % not good quality | verified (both cut-offs quoted by several sources) |
| Cumulative radiation dose | < 300 mSv *(team band)* | 300–600 mSv | ≥ 600 mSv | NASA-STD-3001 Vol. 1 Rev. C, requirement V1 4030, section 4.8.2, via the [OCHMO radiation brief](https://www.nasa.gov/wp-content/uploads/2023/03/radiation-protection-technical-brief-ochmo.pdf) | verified |
| Calcium intake | 1000–2500 mg/day | 600–1000 *(team band)* | < 600, ≥ 2500 | [NASA JSC-67378 Rev. 1](https://ntrs.nasa.gov/citations/20205008306): 1000–1200 mg/day, max 2500 | verified |
| Fluid intake | ≥ 2100 mL/day | 1500–2100 *(team band)* | < 1500 | NASA JSC-67378 Rev. 1: 32 mL/kg/day, ≥ 2100 women, ≥ 2500 men | verified (uses the lower floor) |

**Verification levels**

- *verified*: the cut-offs were found in the cited document, or in several sources quoting it, on 2026-11-14.
- *partially verified*: the main cut-off was confirmed, but a second band or the document revision only appeared in a secondary source.
- *to verify*: a well-known reference not checked yet.
- *team band*: a caution band between the sourced normal range and the critical limit, chosen by the team because the source defines none. The normal range is never a team band.

**Metrics without a threshold, on purpose:** heart rate variability (only meaningful against a personal baseline); muscle strength change, reaction time, mood, stress and isolation (no clinical cut-offs); radiation dose rate (NASA limits accumulated dose, not the rate); calorie intake (NASA sets it per person with the DRI equations).

**Solar-storm alert (proposal):** since no dose-rate threshold exists, the alert should come from space weather. NOAA's [solar radiation storm scale](https://www.spaceweather.gov/node/415) starts at S1 when protons ≥ 10 MeV reach 10 pfu at geosynchronous orbit; the DONKI onsets in the dataset mark those moments. This would be a rule of the rules engine, still to agree with Carlos.

## Onboard formulary

[`backend/data/formulary.ts`](../backend/data/formulary.ts): acetaminophen 325 mg tablets, ibuprofen 400 mg tablets, aspirin and melatonin.

- **Sources:** the [NASA ISS Medical Kit Checklist](https://www.nasa.gov/wp-content/uploads/2015/03/medical_kit_checklist_-_full_release.pdf) (kit structure) and the ISS medication list obtained from NASA through FOIA and reproduced by [WikEM](https://wikem.org/wiki/Common_medication_list_onboard_ISS/de) (acetaminophen 325 mg, ibuprofen 400 mg, aspirin, melatonin and several antihistamines).
- **No dosages**: CHIEF must never suggest doses beyond the formulary, and none was found with a citable source. Add one only with a source.
- Ibuprofen carries a note of caution for crew members with asthma.

## Indicators and metric catalog

The 25 metrics in [`backend/data/metrics.ts`](../backend/data/metrics.ts) cover the 9 body systems of `shared/`. They follow the kinds of indicators NASA's Human Research Program tracks in its Spaceflight Standard Measures (sleep, cognition, immune, blood and urine chemistry, cardiovascular, behavioral). Individual HRP data is restricted (NASA Life Sciences Data Archive), so it informs which indicators to show, not the values.

## Simulated values and assumptions

These values are **not** from a source; they are plausible choices, always stored with `simulated = true`. The full parameter table is in [simulator.md](simulator.md).

| Assumption | Value | Basis |
| --- | --- | --- |
| Mission | 180 days from 2026-09-01; the seed stops at mission day 60, 12:00 UTC | `CLAUDE.md`: a 6-month ISS mission |
| Baselines and noise of each metric | e.g. resting heart rate 70 bpm ± 2.5 | Plausible healthy adult values; blood values use the OSDR baselines above |
| Bone loss trend | −0.035 %/day (about −1 %/month) | Within the 0.5–1.5 %/month spaceflight loss rate reported in NASA material |
| Prior career radiation dose | C001 120, C002 280, C003 45, C004 90 mSv | Fictional; C002 is set close to the 300 mSv caution band for the demo |
| Dose rate on board | 18 µSv/h ± 2.5 (about 0.43 mSv/day) | Plausible ISS order of magnitude |
| Storm dose-rate increase | +40 / +80 µSv/h, 10 h decay | Simulated; only the timing is real (DONKI) |
| Nutrition intake | calcium 1150 mg/day, fluid 2650 mL/day, energy 2600 kcal/day | Set inside the JSC-67378 targets so healthy crew members stay nominal |
| Demo scenarios | see [simulator.md](simulator.md) | Synthetic cases planted so alerts fire, as `CLAUDE.md` asks |

## Looked at but not used

| Source or data | Why not |
| --- | --- |
| OSDR C-reactive protein (Eve multiplex panel) | Research assay, not comparable to the clinical threshold |
| OSDR hemoglobin | Sex-specific ranges; our crew's sexes are fictional |
| OSDR postflight timepoints | After a 3-day flight; would fall after our simulated mission |
| DONKI flares (`FLR`) | Endpoint returned 404 for the window |
| DONKI June 2024 proton events | Not part of the May storm |
| NASA-STD-3001 Rev C bone T-score requirement (V1 4026) | Pre-mission selection criterion, not an in-mission limit; V1 4027 is used instead |
| PhysioNet, ISS Live, ISS position APIs, NOAA SWPC live data | Part of an earlier design (offline-first ground link, ISS position); out of the scope set in `CLAUDE.md` |

## Open verification tasks

- Several entries are verified through documents that quote the original (WHO manual, Pearson 2003, Ohayon 2017); read the originals if access allows.
- Agree on the space-weather rule for the solar-storm alert.
- Refresh DONKI with a real `NASA_API_KEY` if the dataset needs to change.

## Retrieval log

| Date | What |
| --- | --- |
| 2026-11-14 | OSDR OSD-569 and OSD-575 file listings and CSVs downloaded; processed into `osdr-inspiration4-blood.json` |
| 2026-11-14 | DONKI SEP and GST (2024-05-01 to 2024-06-29) downloaded with `DEMO_KEY`; processed into `donki-may-2024-storm.json` |
| 2026-11-14 | Second pass: bone targets traced to NASA-STD-3001 V1 4027 (OCHMO-MTB-013 Rev D); WHO SpO2, ADA hypoglycemia, Pearson CRP > 10 mg/L, NSF sleep efficiency (adults) and Frisén grades confirmed. Every threshold is now `verified` |
| 2026-11-14 | Threshold sources checked by web search: NASA OCHMO briefs, NASA-STD-3001 Rev C, JSC-67378, NASA JSC vitamin D flow, ACC/AHA 2017, ADA, AASM/SRS 2015, NSF 2017, CDC/AHA 2003, WHO pulse oximetry, hypercalciuria review, IOP references, NOAA scales, ISS medical kit |
