import { and, asc, eq, gte, lte, max } from 'drizzle-orm';
import {
  ALERT_SEVERITIES,
  type BodySystemId,
  type CrewMember,
  type Measurement,
  type Metric,
  type MissionClock,
  type Threshold,
} from '@chief/shared';
import type { Db } from './client.js';
import type { AlertWithRecommendation, Medication } from './types.js';
import {
  alerts,
  crewMembers,
  formulary,
  measurements,
  metrics,
  mission,
  thresholds,
} from './schema.js';

/**
 * Database access for the rest of the backend. Each function returns the types of `@chief/shared`
 * (camelCase, string ids), so controllers and the rules engine never see table rows. Only the backend
 * writes to the database, and all SQL lives in this folder.
 */

const DAY = 86_400_000;

// --- crew and mission -----------------------------------------------------------------------------

export function getCrew(db: Db): CrewMember[] {
  return db
    .select()
    .from(crewMembers)
    .orderBy(asc(crewMembers.id))
    .all()
    .map((row) => ({
      id: row.id,
      name: row.name,
      role: row.role,
      agency: row.agency,
      age: row.age,
      sex: row.sex,
      avatarUrl: row.avatarUrl ?? undefined,
    }));
}

export function getMissionClock(db: Db): MissionClock {
  const row = db.select().from(mission).where(eq(mission.id, 1)).get();
  if (!row) throw new Error('The mission is not set up. Run `npm run db:reset -w backend`.');
  return {
    missionDay: Math.floor((Date.parse(row.simTime) - Date.parse(row.startAt)) / DAY) + 1,
    missionLengthDays: row.lengthDays,
    missionTime: row.simTime,
    timeScale: row.timeScale,
  };
}

/** Moves the simulated clock. `simTime` must be `YYYY-MM-DDTHH:mm:ssZ` and not before the mission start. */
export function setMissionTime(db: Db, simTime: string): void {
  db.update(mission).set({ simTime }).where(eq(mission.id, 1)).run();
}

// --- metrics, thresholds and formulary ------------------------------------------------------------

export function getMetrics(db: Db): Metric[] {
  return db
    .select()
    .from(metrics)
    .orderBy(asc(metrics.system), asc(metrics.id))
    .all()
    .map((row) => ({
      id: row.id,
      system: row.system as BodySystemId,
      name: row.name,
      unit: row.unit,
      description: row.description,
      spaceflightEffect: row.spaceflightEffect ?? undefined,
      origin: row.origin,
      cadenceMinutes: row.cadenceMinutes,
    }));
}

export function getThresholds(db: Db): Threshold[] {
  return db
    .select()
    .from(thresholds)
    .orderBy(asc(thresholds.metricId))
    .all()
    .map((row) => ({
      metricId: row.metricId,
      ranges: row.ranges,
      escalation: row.escalation,
      fallbackRecommendation: row.fallbackRecommendation,
      source: row.source,
    }));
}

export function getFormulary(db: Db): Medication[] {
  return db
    .select()
    .from(formulary)
    .orderBy(asc(formulary.id))
    .all()
    .map((row) => ({
      id: row.id,
      name: row.name,
      indication: row.indication,
      dosage: row.dosage ?? undefined,
      notes: row.notes ?? undefined,
    }));
}

// --- measurements ---------------------------------------------------------------------------------

type MeasurementRow = typeof measurements.$inferSelect;

function toMeasurement(row: MeasurementRow): Measurement {
  return {
    id: String(row.id),
    crewMemberId: row.crewId,
    metricId: row.metricId,
    value: row.value,
    takenAt: row.takenAt,
    simulated: row.simulated,
  };
}

export interface MeasurementQuery {
  crewId: string;
  metricId: string;
  /** Inclusive, `YYYY-MM-DDTHH:mm:ssZ`. */
  from?: string;
  /** Inclusive, `YYYY-MM-DDTHH:mm:ssZ`. */
  to?: string;
}

/** Readings of one metric of one crew member, oldest first. Dates must be in the database format. */
export function getMeasurements(db: Db, query: MeasurementQuery): Measurement[] {
  const conditions = [
    eq(measurements.crewId, query.crewId),
    eq(measurements.metricId, query.metricId),
  ];
  if (query.from) conditions.push(gte(measurements.takenAt, query.from));
  if (query.to) conditions.push(lte(measurements.takenAt, query.to));
  return db
    .select()
    .from(measurements)
    .where(and(...conditions))
    .orderBy(asc(measurements.takenAt))
    .all()
    .map(toMeasurement);
}

/** The most recent reading of every metric of a crew member. */
export function getLatestMeasurements(db: Db, crewId: string): Measurement[] {
  const latest = db
    .select({
      metricId: measurements.metricId,
      takenAt: max(measurements.takenAt).as('latest_taken_at'),
    })
    .from(measurements)
    .where(eq(measurements.crewId, crewId))
    .groupBy(measurements.metricId)
    .as('latest');
  return db
    .select({ row: measurements })
    .from(measurements)
    .innerJoin(
      latest,
      and(eq(measurements.metricId, latest.metricId), eq(measurements.takenAt, latest.takenAt)),
    )
    .where(eq(measurements.crewId, crewId))
    .orderBy(asc(measurements.metricId))
    .all()
    .map(({ row }) => toMeasurement(row));
}

export type NewMeasurement = Omit<Measurement, 'id'>;

/**
 * Stores a reading. A reading of the same crew member, metric and instant is ignored, so the
 * simulator can repeat itself safely. Look at `inserted`: `lastInsertRowid` is not reliable after an
 * ignored insert.
 */
export function insertMeasurement(
  db: Db,
  measurement: NewMeasurement,
): { inserted: boolean; id: string | null } {
  const result = db
    .insert(measurements)
    .values({
      crewId: measurement.crewMemberId,
      metricId: measurement.metricId,
      value: measurement.value,
      takenAt: measurement.takenAt,
      simulated: measurement.simulated,
    })
    .onConflictDoNothing()
    .run();
  return result.changes === 0
    ? { inserted: false, id: null }
    : { inserted: true, id: String(result.lastInsertRowid) };
}

// --- alerts ---------------------------------------------------------------------------------------

type AlertRow = typeof alerts.$inferSelect;

function toAlert(row: AlertRow): AlertWithRecommendation {
  return {
    id: String(row.id),
    crewMemberId: row.crewId,
    system: row.system as BodySystemId,
    kind: row.kind,
    severity: row.severity,
    title: row.title,
    message: row.message,
    escalation: row.escalation,
    metricId: row.metricId ?? undefined,
    dueAt: row.dueAt ?? undefined,
    createdAt: row.createdAt,
    acknowledged: row.acknowledged,
    recommendation: row.recommendation ?? undefined,
  };
}

/** Alerts of a crew member, most urgent first, then newest first. */
export function getAlerts(db: Db, crewId: string): AlertWithRecommendation[] {
  return db
    .select()
    .from(alerts)
    .where(eq(alerts.crewId, crewId))
    .all()
    .map(toAlert)
    .sort(
      (a, b) =>
        ALERT_SEVERITIES.indexOf(a.severity) - ALERT_SEVERITIES.indexOf(b.severity) ||
        b.createdAt.localeCompare(a.createdAt),
    );
}

export function getAlert(db: Db, id: string): AlertWithRecommendation | null {
  const row = db
    .select()
    .from(alerts)
    .where(eq(alerts.id, Number(id)))
    .get();
  return row ? toAlert(row) : null;
}

export type NewAlert = Omit<AlertWithRecommendation, 'id' | 'acknowledged'>;

export function insertAlert(db: Db, alert: NewAlert): AlertWithRecommendation {
  const row = db
    .insert(alerts)
    .values({
      crewId: alert.crewMemberId,
      system: alert.system,
      kind: alert.kind,
      severity: alert.severity,
      title: alert.title,
      message: alert.message,
      escalation: alert.escalation,
      metricId: alert.metricId ?? null,
      dueAt: alert.dueAt ?? null,
      createdAt: alert.createdAt,
      recommendation: alert.recommendation ?? null,
    })
    .returning()
    .get();
  return toAlert(row);
}

/** Marks an alert as acknowledged. Returns the updated alert, or null if it does not exist. */
export function acknowledgeAlert(db: Db, id: string): AlertWithRecommendation | null {
  const row = db
    .update(alerts)
    .set({ acknowledged: true })
    .where(eq(alerts.id, Number(id)))
    .returning()
    .get();
  return row ? toAlert(row) : null;
}
