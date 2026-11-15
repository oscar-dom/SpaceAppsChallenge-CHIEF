# @chief/shared

Types and constants shared by `frontend/` and `backend/`: the contract between them.

```ts
import type { Alert, HealthScore } from '@chief/shared';
import { BODY_SYSTEMS } from '@chief/shared';
```

To use it from a workspace, add it to that workspace's `package.json` and run
`npm install` at the repository root:

```json
"dependencies": { "@chief/shared": "*" }
```

The package is consumed as TypeScript source (no build step). Vite (frontend) and `tsx`
(backend) compile it on the fly.

| File | Contents |
|---|---|
| `status.ts` | `Status`, `EscalationLevel`, `Trend` |
| `systems.ts` | `BODY_SYSTEMS` (left menu), `BodySystemId`, `MenuSectionId` |
| `crew.ts` | `CrewMember`, `MissionClock` |
| `metrics.ts` | `Metric`, `Measurement`, `Threshold`, `MetricStatus`, `Period` |
| `health.ts` | `SystemStatus`, `HealthScore` |
| `alerts.ts` | `Alert`, `AlertKind`, `AlertSeverity` |
| `journey.ts` | JOURNEY: `Journey`, `JourneyStage`, `Hazard`, `Resupply`; ship inventory: `InventoryItem`, `InventoryStock`, `InventoryEvent`, `InventoryHistory`, `StageInventory`, `InventoryAdjustRequest` |
| `chief.ts` | CHIEF chat and alert actions (frontend ↔ backend), `Medication`, and the backend → agent contract (`Agent*`) |
| `api.ts` | REST routes, `ApiError`, Socket.IO events |

**This package is owned by the whole team.** Agree on a change before merging it,
because it affects both sides. The Python agent mirrors the `Agent*` types of `chief.ts` in `agent/chief/schemas.py`.
