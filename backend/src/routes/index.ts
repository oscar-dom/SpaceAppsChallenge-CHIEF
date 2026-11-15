import express, { Router } from 'express';
import { alertsController } from '../controllers/alerts.controller.js';
import { chiefController } from '../controllers/chief.controller.js';
import { crewController } from '../controllers/crew.controller.js';
import { journeyController } from '../controllers/journey.controller.js';
import type { Services } from '../services/index.js';

/** Audio larger than this is rejected before it reaches the agent (same limit as the agent). */
const MAX_AUDIO = '10mb';

/** REST routes under /api, as listed in shared/src/api.ts. */
export function apiRouter(services: Services): Router {
  const router = Router();
  const crew = crewController(services);
  const alerts = alertsController(services);
  const chief = chiefController(services);
  const journey = journeyController(services);

  router.get('/crew', crew.list);
  router.get('/mission/clock', crew.missionClock);
  router.get('/metrics', crew.metrics);
  router.get('/thresholds', crew.thresholds);
  router.get('/crew/:crewId/health', crew.healthScore);
  router.get('/crew/:crewId/systems/:systemId', crew.system);
  router.get('/crew/:crewId/measurements', crew.measurements);
  router.get('/crew/:crewId/alerts', crew.crewAlerts);

  router.post('/alerts/:alertId/acknowledge', alerts.acknowledge);
  router.post('/alerts/:alertId/actions', alerts.actions);

  router.get('/journey', journey.route);
  router.get('/journey/stages/:index/inventory', journey.stageInventory);
  router.get('/inventory', journey.stocks);
  router.get('/inventory/:itemId/history', journey.history);
  router.post('/inventory/:itemId/adjust', journey.adjust);

  router.post('/chief/chat', chief.chat);
  router.post(
    '/chief/stt',
    express.raw({ type: ['audio/*', 'video/webm', 'application/octet-stream'], limit: MAX_AUDIO }),
    chief.speechToText,
  );
  router.post('/chief/tts', chief.textToSpeech);

  return router;
}
