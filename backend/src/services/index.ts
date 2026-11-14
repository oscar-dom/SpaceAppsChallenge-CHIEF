import type { Logger } from 'pino';
import type { Env } from '../config/env.js';
import type { Db } from '../db/client.js';
import { AgentClient } from './agent/client.js';
import { AlertsService } from './alerts.service.js';
import { ChiefService } from './chief.service.js';
import { CrewService } from './crew.service.js';
import { HealthService } from './health.service.js';
import { MissionClock } from './mission-clock.js';

export interface Services {
  clock: MissionClock;
  crew: CrewService;
  health: HealthService;
  alerts: AlertsService;
  chief: ChiefService;
}

type ServicesEnv = Pick<Env, 'AGENT_URL' | 'AGENT_TIMEOUT_MS' | 'TIME_SCALE'>;

/** Wires every service together. The mission clock resumes at the time stored in the database. */
export function createServices(db: Db, env: ServicesEnv, logger: Logger): Services {
  const clock = new MissionClock(db, { timeScale: env.TIME_SCALE });
  const crew = new CrewService(db);
  const health = new HealthService(db, clock);
  const alerts = new AlertsService(db, clock, health);
  const agent = new AgentClient(env.AGENT_URL, env.AGENT_TIMEOUT_MS);
  const chief = new ChiefService(clock, crew, health, alerts, agent, logger);
  return { clock, crew, health, alerts, chief };
}
