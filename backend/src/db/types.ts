import type { Alert } from '@chief/shared';

/**
 * Types the database layer needs that are not in `@chief/shared` on `develop` yet. They mirror, field
 * for field, the ones the agent branch (feat/chief-agent) adds to `shared/src/chief.ts` and
 * `shared/src/alerts.ts`. When that branch is merged, delete this file and import `Medication`
 * from `@chief/shared`; `Alert` will then already carry `recommendation`.
 */

/** An item of the onboard formulary: the only medication CHIEF may suggest. */
export interface Medication {
  id: string;
  name: string;
  /** What it is used for, e.g. "Mild to moderate pain, headache". */
  indication: string;
  /** e.g. "400 mg every 8 h with food, max 1200 mg/day". */
  dosage?: string;
  notes?: string;
}

/** `Alert` plus the generic advice from the thresholds table (CHIEF's fallback when Gemini is down). */
export type AlertWithRecommendation = Alert & { recommendation?: string };
