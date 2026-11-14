import { BODY_SYSTEMS, PERIODS, type BodySystemId } from '@chief/shared';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import { parseInput } from '../middlewares/validate.js';
import type { Services } from '../services/index.js';

const SYSTEM_IDS = BODY_SYSTEMS.map((s) => s.id) as [BodySystemId, ...BodySystemId[]];

const crewParams = z.object({ crewId: z.string().regex(/^C\d{3}$/, 'Invalid crew member id') });
const systemParams = crewParams.extend({ systemId: z.enum(SYSTEM_IDS) });
const measurementsQuery = z.object({
  metricId: z.string().min(1),
  period: z.enum(PERIODS).default('day'),
});

/** Thin handlers: validate the input, call a service, send the result. */
export function crewController({ crew, health, alerts, clock }: Services) {
  const list: RequestHandler = (_req, res) => {
    res.json(crew.list());
  };

  const missionClock: RequestHandler = (_req, res) => {
    res.json(clock.snapshot());
  };

  const metrics: RequestHandler = (_req, res) => {
    res.json(health.metrics);
  };

  const thresholds: RequestHandler = (_req, res) => {
    res.json(health.listThresholds());
  };

  const healthScore: RequestHandler = (req, res) => {
    const { crewId } = parseInput(crewParams, req.params);
    crew.get(crewId);
    res.json(health.evaluate(crewId).health);
  };

  const system: RequestHandler = (req, res) => {
    const { crewId, systemId } = parseInput(systemParams, req.params);
    crew.get(crewId);
    res.json(health.system(crewId, systemId));
  };

  const measurements: RequestHandler = (req, res) => {
    const { crewId } = parseInput(crewParams, req.params);
    const { metricId, period } = parseInput(measurementsQuery, req.query);
    crew.get(crewId);
    res.json(health.measurements(crewId, metricId, period));
  };

  const crewAlerts: RequestHandler = (req, res) => {
    const { crewId } = parseInput(crewParams, req.params);
    crew.get(crewId);
    res.json(alerts.list(crewId));
  };

  return { list, missionClock, metrics, thresholds, healthScore, system, measurements, crewAlerts };
}
