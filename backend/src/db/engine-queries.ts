import { eq, sql } from 'drizzle-orm';
import type { Measurement } from '@chief/shared';
import type { Db } from './client.js';
import { alerts } from './schema.js';

/**
 * Queries the API and the rules engine need on top of queries.ts: chart series aggregated
 * in SQL, and the alert updates of the engine (one open alert per metric out of range).
 */

export interface SeriesQuery {
  crewId: string;
  metricId: string;
  /** Inclusive, `YYYY-MM-DDTHH:mm:ssZ`. */
  from: string;
  /** Inclusive, `YYYY-MM-DDTHH:mm:ssZ`. */
  to: string;
  maxPoints: number;
}

/**
 * Readings of one metric between two instants, oldest first, never more than `maxPoints`:
 * longer series are averaged in time buckets in SQL, so a chart never receives thousands
 * of rows. A bucket counts as simulated if any of its readings is.
 */
export function getMeasurementSeries(db: Db, query: SeriesQuery): Measurement[] {
  const { crewId, metricId, from, to, maxPoints } = query;
  const where = sql`crew_id = ${crewId} AND metric_id = ${metricId}
    AND taken_at >= ${from} AND taken_at <= ${to}`;
  const [{ n } = { n: 0 }] = db.all<{ n: number }>(
    sql`SELECT COUNT(*) AS n FROM measurements WHERE ${where}`,
  );

  type Row = { id: string; value: number; takenAt: string; simulated: number };
  // Inlined, not bound: better-sqlite3 binds JS numbers as REAL, which would turn the
  // integer division below into a real one (one bucket per row). It is our own integer.
  const bucket = sql.raw(String(bucketSeconds(from, to, maxPoints)));
  const rows =
    n <= maxPoints
      ? db.all<Row>(sql`SELECT CAST(id AS TEXT) AS id, value, taken_at AS takenAt, simulated
          FROM measurements WHERE ${where} ORDER BY taken_at`)
      : db.all<Row>(sql`SELECT ${crewId} || ':' || ${metricId} || ':' || MIN(taken_at) AS id,
            AVG(value) AS value, MIN(taken_at) AS takenAt, MAX(simulated) AS simulated
          FROM measurements WHERE ${where}
          GROUP BY CAST(strftime('%s', taken_at) AS INTEGER) / ${bucket}
          ORDER BY takenAt`);

  return rows.map((row) => ({
    id: row.id,
    crewMemberId: crewId,
    metricId,
    value: Math.round(row.value * 100) / 100,
    takenAt: row.takenAt,
    simulated: row.simulated === 1,
  }));
}

/** Buckets are aligned to the epoch, so a range can touch one bucket more than it spans. */
function bucketSeconds(from: string, to: string, maxPoints: number): number {
  const rangeSeconds = (Date.parse(to) - Date.parse(from)) / 1000;
  return Math.max(1, Math.ceil(rangeSeconds / Math.max(1, maxPoints - 1)));
}

export interface AlertUpdate {
  severity: 'caution' | 'critical';
  title: string;
  message: string;
  escalation: 'self-care' | 'crew-medical-officer' | 'flight-surgeon';
}

/** New severity or text of an open anomaly alert (its metric is still out of range). */
export function updateAlert(db: Db, id: string, update: AlertUpdate): void {
  db.update(alerts)
    .set(update)
    .where(eq(alerts.id, Number(id)))
    .run();
}

/**
 * Removes an alert that no longer applies (its metric is back to nominal, or its scheduled
 * measurement was taken). The alerts table has no resolved state, so resolving deletes it.
 */
export function deleteAlert(db: Db, id: string): void {
  db.delete(alerts)
    .where(eq(alerts.id, Number(id)))
    .run();
}
