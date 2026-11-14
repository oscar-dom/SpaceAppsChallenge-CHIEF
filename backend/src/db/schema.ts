import { sql, type SQL } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import {
  ALERT_SEVERITIES,
  BODY_SYSTEMS,
  ESCALATION_LEVELS,
  type SourceReference,
  type Threshold,
} from '@chief/shared';

/**
 * Database schema (Drizzle ORM, SQLite). Every table mirrors a type of `@chief/shared`:
 *
 *   mission          -> MissionClock
 *   crew_members     -> CrewMember
 *   metrics          -> Metric
 *   measurements     -> Measurement
 *   thresholds       -> Threshold (a threshold without a source cannot be stored)
 *   alerts           -> Alert
 *   formulary        -> Medication (the onboard formulary CHIEF may suggest from)
 *
 * Dates are the simulated mission time, `YYYY-MM-DDTHH:mm:ssZ` (UTC, no milliseconds). A CHECK on
 * every date column rejects any other format, so text comparison of ranges always works.
 * Migrations are generated with `npm run db:generate -w backend`; never edit them by hand.
 */

const ISO_DATE_GLOB = "'????-??-??T??:??:??Z'";

export const MEASUREMENT_ORIGINS = ['sensor', 'lab', 'manual', 'in-app-test'] as const;
export const ALERT_KINDS = ['anomaly', 'scheduled'] as const;
export const SEX_VALUES = ['female', 'male'] as const;

const BODY_SYSTEM_IDS = BODY_SYSTEMS.map((system) => system.id);

/** `'a', 'b', 'c'` for a CHECK ... IN (...) clause. Values come from constants, never from users. */
function inList(values: readonly string[]): SQL {
  return sql.raw(values.map((value) => `'${value}'`).join(', '));
}

export const crewMembers = sqliteTable(
  'crew_members',
  {
    /** OSDR Inspiration4 anonymous code: C001..C004. */
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    role: text('role').notNull(),
    agency: text('agency').notNull(),
    age: integer('age').notNull(),
    sex: text('sex', { enum: SEX_VALUES }).notNull(),
    avatarUrl: text('avatar_url'),
    heightCm: real('height_cm'),
    weightKg: real('weight_kg'),
  },
  (t) => [
    check('crew_members_id_format', sql`${t.id} GLOB 'C[0-9][0-9][0-9]'`),
    check('crew_members_age_positive', sql`${t.age} > 0`),
    check('crew_members_sex_valid', sql`${t.sex} IN (${inList(SEX_VALUES)})`),
  ],
);

/** The simulated mission. A single row (id = 1): its clock is what `MissionClock` exposes. */
export const mission = sqliteTable(
  'mission',
  {
    id: integer('id').primaryKey(),
    name: text('name').notNull(),
    startAt: text('start_at').notNull(),
    lengthDays: integer('length_days').notNull(),
    /** Simulated seconds per real second. */
    timeScale: real('time_scale').notNull(),
    /** Current simulated time. The simulator advances it. */
    simTime: text('sim_time').notNull(),
  },
  (t) => [
    check('mission_single_row', sql`${t.id} = 1`),
    check('mission_start_format', sql`${t.startAt} GLOB ${sql.raw(ISO_DATE_GLOB)}`),
    check('mission_sim_time_format', sql`${t.simTime} GLOB ${sql.raw(ISO_DATE_GLOB)}`),
    check('mission_length_positive', sql`${t.lengthDays} > 0`),
    check('mission_time_scale_positive', sql`${t.timeScale} > 0`),
    check('mission_clock_not_before_start', sql`${t.simTime} >= ${t.startAt}`),
  ],
);

export const metrics = sqliteTable(
  'metrics',
  {
    /** Stable kebab-case id, e.g. "resting-heart-rate". */
    id: text('id').primaryKey(),
    system: text('system', { enum: BODY_SYSTEM_IDS as [string, ...string[]] }).notNull(),
    name: text('name').notNull(),
    unit: text('unit').notNull(),
    description: text('description').notNull(),
    spaceflightEffect: text('spaceflight_effect'),
    origin: text('origin', { enum: MEASUREMENT_ORIGINS }).notNull(),
    /** Simulated minutes between readings. */
    cadenceMinutes: integer('cadence_minutes').notNull(),
  },
  (t) => [
    check('metrics_system_valid', sql`${t.system} IN (${inList(BODY_SYSTEM_IDS)})`),
    check('metrics_origin_valid', sql`${t.origin} IN (${inList(MEASUREMENT_ORIGINS)})`),
    check('metrics_cadence_positive', sql`${t.cadenceMinutes} > 0`),
    index('metrics_system_idx').on(t.system),
  ],
);

export const measurements = sqliteTable(
  'measurements',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    crewId: text('crew_id')
      .notNull()
      .references(() => crewMembers.id),
    metricId: text('metric_id')
      .notNull()
      .references(() => metrics.id),
    value: real('value').notNull(),
    /** Simulated time of the reading. */
    takenAt: text('taken_at').notNull(),
    /** True when the value is synthetic and not a real NASA measurement. Never present it as real. */
    simulated: integer('simulated', { mode: 'boolean' }).notNull().default(true),
  },
  (t) => [
    check('measurements_taken_at_format', sql`${t.takenAt} GLOB ${sql.raw(ISO_DATE_GLOB)}`),
    // One reading per crew member, metric and instant. Also the index for charts and "latest value".
    uniqueIndex('measurements_crew_metric_time_uq').on(t.crewId, t.metricId, t.takenAt),
    index('measurements_metric_time_idx').on(t.metricId, t.takenAt),
  ],
);

/** One row per metric. The source is mandatory: "no threshold without a source". */
export const thresholds = sqliteTable(
  'thresholds',
  {
    metricId: text('metric_id')
      .primaryKey()
      .references(() => metrics.id),
    /** Ranges per status. A value outside every range counts as critical. */
    ranges: text('ranges', { mode: 'json' }).$type<Threshold['ranges']>().notNull(),
    escalation: text('escalation', { mode: 'json' }).$type<Threshold['escalation']>().notNull(),
    /** Generic advice CHIEF falls back to when Gemini is unavailable. */
    fallbackRecommendation: text('fallback_recommendation').notNull(),
    source: text('source', { mode: 'json' }).$type<SourceReference>().notNull(),
  },
  (t) => [
    check(
      'thresholds_ranges_array',
      sql`json_valid(${t.ranges}) AND json_type(${t.ranges}) = 'array'`,
    ),
    check(
      'thresholds_escalation_object',
      sql`json_valid(${t.escalation}) AND json_type(${t.escalation}) = 'object'`,
    ),
    check(
      'thresholds_source_required',
      sql`json_valid(${t.source}) AND length(trim(coalesce(json_extract(${t.source}, '$.document'), ''))) > 0`,
    ),
  ],
);

export const alerts = sqliteTable(
  'alerts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    crewId: text('crew_id')
      .notNull()
      .references(() => crewMembers.id),
    system: text('system', { enum: BODY_SYSTEM_IDS as [string, ...string[]] }).notNull(),
    kind: text('kind', { enum: ALERT_KINDS }).notNull(),
    severity: text('severity', { enum: ALERT_SEVERITIES }).notNull(),
    title: text('title').notNull(),
    message: text('message').notNull(),
    escalation: text('escalation', { enum: ESCALATION_LEVELS }).notNull(),
    /** Metric that triggered an `anomaly` alert. */
    metricId: text('metric_id').references(() => metrics.id),
    /** When a `scheduled` alert is due. */
    dueAt: text('due_at'),
    createdAt: text('created_at').notNull(),
    acknowledged: integer('acknowledged', { mode: 'boolean' }).notNull().default(false),
    /** Generic advice from the thresholds table (CHIEF's fallback). */
    recommendation: text('recommendation'),
  },
  (t) => [
    check('alerts_system_valid', sql`${t.system} IN (${inList(BODY_SYSTEM_IDS)})`),
    check('alerts_kind_valid', sql`${t.kind} IN (${inList(ALERT_KINDS)})`),
    check('alerts_severity_valid', sql`${t.severity} IN (${inList(ALERT_SEVERITIES)})`),
    check('alerts_escalation_valid', sql`${t.escalation} IN (${inList(ESCALATION_LEVELS)})`),
    check('alerts_created_at_format', sql`${t.createdAt} GLOB ${sql.raw(ISO_DATE_GLOB)}`),
    check('alerts_due_at_format', sql`${t.dueAt} GLOB ${sql.raw(ISO_DATE_GLOB)}`),
    check('alerts_anomaly_has_metric', sql`${t.kind} = 'scheduled' OR ${t.metricId} IS NOT NULL`),
    check('alerts_scheduled_has_due', sql`${t.kind} = 'anomaly' OR ${t.dueAt} IS NOT NULL`),
    index('alerts_crew_idx').on(t.crewId, t.acknowledged, t.createdAt),
  ],
);

/** Onboard formulary: the only medication CHIEF may suggest. Mirrors `Medication`. */
export const formulary = sqliteTable(
  'formulary',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    indication: text('indication').notNull(),
    dosage: text('dosage'),
    notes: text('notes'),
    source: text('source', { mode: 'json' }).$type<SourceReference>().notNull(),
  },
  (t) => [
    check(
      'formulary_source_required',
      sql`json_valid(${t.source}) AND length(trim(coalesce(json_extract(${t.source}, '$.document'), ''))) > 0`,
    ),
  ],
);
