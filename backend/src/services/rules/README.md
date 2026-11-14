# `src/services/rules`: rules engine

The source of truth for every status in the UI. **Deterministic, no AI, no I/O**: pure
functions that take readings and thresholds and return statuses, scores and alert
changes. CHIEF never decides a status; it explains this engine's output (CLAUDE.md §7).

| File | Contents |
| --- | --- |
| `engine.ts` | the engine |
| `engine.test.ts` | unit tests, plus checks on the real data files (every threshold has a source and a nominal range; simulation baselines are nominal) |

The engine does not read the database: `HealthService` and `AlertsService`
(`../`) load the data, call these functions and store the results.

## Functions

| Function | Input → output |
| --- | --- |
| `evaluateValue(value, threshold)` | → `Status`. The first range of `threshold.ranges` that contains the value; **min inclusive, max exclusive**. A value outside every range is `critical` |
| `nominalRange(threshold)` | → the nominal `{ min?, max? }` |
| `deviation(value, threshold)` | → `'low' \| 'high' \| undefined` relative to the nominal range |
| `worstStatus(statuses)` | → the most severe (`critical` > `caution` > `nominal`) |
| `computeTrend(values)` | → `rising \| falling \| stable`: mean of the last third vs. the first third of the series, ±3 % (`TREND_MIN_CHANGE`) |
| `evaluateSystem(system, metrics, isScored)` | → `SystemStatus`: status = worst scored metric, score = mean of `STATUS_SCORE` (nominal 100, caution 60, critical 20). No scored metric → nominal, 100 |
| `computeHealthScore(crewId, systems, weights, computedAt, isScored)` | → `HealthScore`: weighted mean of the systems with scored metrics (`SYSTEM_WEIGHTS`, normalized). Status = worst system status |
| `findAnomalies(inputs)` | → one `AnomalyFinding` per non-nominal metric, with title and message for the alerts panel |
| `diffAlerts(findings, open)` | → `{ create, update, resolve }` against the alerts already open |

`isScored` decides which metrics count. The backend passes "has a reading **and** a
sourced threshold": metrics without a threshold are shown but never change a score.

## Worked example

Thresholds (`backend/data/thresholds.ts`, `Threshold` in `shared/src/metrics.ts`):

```ts
{ metricId: 'vitamin-d-25-oh', ranges: [
    { status: 'nominal', range: { min: 30 } },
    { status: 'caution', range: { min: 20, max: 30 } },  // insufficiency
  ],                                                       // < 20: deficiency
  escalation: { caution: 'crew-medical-officer', critical: 'flight-surgeon' }, ... }
```

- 25 ng/mL → `caution` (20 inclusive, 30 exclusive).
- 14.5 ng/mL is in no range → `critical`, escalated to `flight-surgeon`; `findAnomalies` gives the title `Low vitamin D (25-OH)` and the
  message `Vitamin D (25-OH) is 14.5 ng/mL (nominal 30 ng/mL or more).`
- blood-biochemistry with metrics critical (20) + nominal (100) → score 60, status
  `critical`.
- A health score can be high (e.g. 93) and still `critical`: the status is the worst
  system, the score is an average. The UI should show both.

## Alert diff

One open anomaly alert per metric, so a metric that stays out of range does not flood
the panel:

| Finding now | Open alert | Result |
| --- | --- | --- |
| out of range | none | `create` |
| out of range, other severity or title | yes | `update` |
| same | yes | nothing |
| back to nominal | yes | `resolve` (the alert is deleted) |

## Rules for changing it

- Do not invent thresholds here: they come from `backend/data/thresholds.ts`, each with a
  NASA source (Héctor's area).
- Keep it pure: no imports from `db/`, no clock, no logger. The current time is passed in
  (`computedAt`).
- Every behaviour change gets a test in `engine.test.ts` (`npm test -w backend`).
