import type { MissionClock as MissionClockState } from '@chief/shared';
import type { Db } from '../db/client.js';
import { getMissionClock } from '../db/queries.js';

/** `YYYY-MM-DDTHH:mm:ssZ`: the database rejects milliseconds. */
export function toDbTime(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Read-only view of the mission time stored in the database. The live simulator
 * (simulator/live.ts) is the only one that moves it, so every "now" in the backend is the
 * time of the latest readings. `timeScale` overrides the stored one, as the simulator does.
 */
export class MissionClock {
  constructor(
    private readonly db: Db,
    private readonly options: { timeScale?: number } = {},
  ) {}

  get timeScale(): number {
    return this.options.timeScale ?? getMissionClock(this.db).timeScale;
  }

  now(): Date {
    return new Date(getMissionClock(this.db).missionTime);
  }

  nowIso(): string {
    return toDbTime(this.now());
  }

  /** The clock as the API shows it; the mission day comes from the stored mission start. */
  snapshot(): MissionClockState {
    const stored = getMissionClock(this.db);
    return { ...stored, timeScale: this.options.timeScale ?? stored.timeScale };
  }
}
