import type { Alert, Metric } from '@chief/shared';
import type { Db } from '../db/client.js';
import { deleteAlert, updateAlert } from '../db/engine-queries.js';
import { acknowledgeAlert, getAlert, getAlerts, insertAlert } from '../db/queries.js';
import { NotFoundError } from '../errors/app-error.js';
import type { CrewEvaluation, HealthService } from './health.service.js';
import { toDbTime, type MissionClock } from './mission-clock.js';
import { diffAlerts, findAnomalies, type OpenAnomaly } from './rules/engine.js';

const MINUTE_MS = 60_000;
/** A scheduled measurement shows up on the alerts panel this long before it is due. */
const SCHEDULED_NOTICE_MS = 6 * 60 * MINUTE_MS;
/** Only infrequent measurements done by the crew get a reminder (weekly labs, eye exams...). */
const SCHEDULED_MIN_CADENCE_MINUTES = 7 * 24 * 60;

const SCHEDULED_LABEL: Record<Metric['origin'], string> = {
  lab: 'Scheduled lab test',
  manual: 'Scheduled measurement',
  'in-app-test': 'Scheduled test',
  sensor: 'Scheduled reading',
};

export interface AlertSync {
  created: Alert[];
  /** Updated alerts, and resolved ones (sent once with `acknowledged: true`, then removed). */
  updated: Alert[];
}

export class AlertsService {
  constructor(
    private readonly db: Db,
    private readonly clock: MissionClock,
    private readonly health: HealthService,
  ) {}

  /** Alerts of a crew member, most urgent first. */
  list(crewId: string): Alert[] {
    return getAlerts(this.db, crewId);
  }

  find(alertId: string): Alert {
    const alert = getAlert(this.db, alertId);
    if (!alert) throw new NotFoundError(`Alert ${alertId} not found`);
    return alert;
  }

  acknowledge(alertId: string): Alert {
    const alert = acknowledgeAlert(this.db, alertId);
    if (!alert) throw new NotFoundError(`Alert ${alertId} not found`);
    return alert;
  }

  /**
   * Brings the alerts of a crew member in line with the latest evaluation, in one
   * transaction: anomalies (one per metric out of range) and reminders of scheduled
   * measurements.
   */
  sync(crewId: string, evaluation: CrewEvaluation): AlertSync {
    const result: AlertSync = { created: [], updated: [] };
    this.db.transaction(() => {
      const open = getAlerts(this.db, crewId);
      this.syncAnomalies(crewId, evaluation, open, result);
      this.syncScheduled(crewId, evaluation, open, result);
    });
    return result;
  }

  private syncAnomalies(
    crewId: string,
    evaluation: CrewEvaluation,
    open: Alert[],
    result: AlertSync,
  ): void {
    const openAnomalies: OpenAnomaly[] = open
      .filter((a) => a.kind === 'anomaly' && a.metricId !== undefined)
      .map((a) => ({
        id: a.id,
        metricId: a.metricId as string,
        status: a.severity === 'critical' ? 'critical' : 'caution',
        title: a.title,
        message: a.message,
      }));
    const changes = diffAlerts(findAnomalies(evaluation.findings), openAnomalies);

    for (const finding of changes.create) {
      const metric = this.health.metric(finding.metricId);
      const threshold = this.health.threshold(finding.metricId);
      result.created.push(
        insertAlert(this.db, {
          crewMemberId: crewId,
          system: metric.system,
          kind: 'anomaly',
          severity: finding.status,
          title: finding.title,
          message: finding.message,
          escalation: threshold?.escalation[finding.status] ?? 'crew-medical-officer',
          metricId: finding.metricId,
          createdAt: this.clock.nowIso(),
          recommendation: threshold?.fallbackRecommendation,
        }),
      );
    }
    for (const { id, finding } of changes.update) {
      const threshold = this.health.threshold(finding.metricId);
      updateAlert(this.db, id, {
        severity: finding.status,
        title: finding.title,
        message: finding.message,
        escalation: threshold?.escalation[finding.status] ?? 'crew-medical-officer',
      });
      result.updated.push(this.find(id));
    }
    for (const id of changes.resolve) this.resolve(id, result);
  }

  /**
   * One reminder per appointment: the infrequent measurements due at the same instant
   * within SCHEDULED_NOTICE_MS (next reading = last reading + cadence) share one alert.
   * It is resolved once their new readings arrive.
   */
  private syncScheduled(
    crewId: string,
    evaluation: CrewEvaluation,
    open: Alert[],
    result: AlertSync,
  ): void {
    const now = this.clock.now().getTime();
    const upcoming = new Map<string, Metric[]>();
    for (const metric of this.health.metrics) {
      if (metric.origin === 'sensor' || metric.cadenceMinutes < SCHEDULED_MIN_CADENCE_MINUTES) {
        continue;
      }
      const last = evaluation.latest.get(metric.id);
      if (!last) continue;
      const dueMs = Date.parse(last.takenAt) + metric.cadenceMinutes * MINUTE_MS;
      if (dueMs - now > SCHEDULED_NOTICE_MS) continue;
      const dueAt = toDbTime(new Date(dueMs));
      upcoming.set(dueAt, [...(upcoming.get(dueAt) ?? []), metric]);
    }

    const reminders = open.filter((a) => a.kind === 'scheduled');
    for (const reminder of reminders) {
      if (!reminder.dueAt || !upcoming.has(reminder.dueAt)) this.resolve(reminder.id, result);
    }
    for (const [dueAt, metrics] of upcoming) {
      if (reminders.some((a) => a.dueAt === dueAt)) continue;
      const [first] = metrics as [Metric, ...Metric[]];
      const single = metrics.length === 1;
      result.created.push(
        insertAlert(this.db, {
          crewMemberId: crewId,
          system: first.system,
          kind: 'scheduled',
          severity: 'info',
          title: single
            ? `${SCHEDULED_LABEL[first.origin]}: ${first.name}`
            : `Scheduled check-up: ${metrics.length} measurements`,
          message: `Due at ${dueAt} (mission time): ${metrics.map((m) => m.name).join(', ')}.`,
          escalation: 'self-care',
          ...(single ? { metricId: first.id } : {}),
          dueAt,
          createdAt: this.clock.nowIso(),
        }),
      );
    }
  }

  private resolve(id: string, result: AlertSync): void {
    const alert = getAlert(this.db, id);
    if (!alert) return;
    deleteAlert(this.db, id);
    result.updated.push({ ...alert, acknowledged: true });
  }
}
