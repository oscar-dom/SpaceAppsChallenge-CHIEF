import type { RequestHandler } from 'express';
import { z } from 'zod';
import { parseInput } from '../middlewares/validate.js';
import type { Services } from '../services/index.js';

const alertParams = z.object({
  alertId: z.string().regex(/^\d+$/, 'Invalid alert id'),
});

export function alertsController({ alerts, chief }: Services) {
  const acknowledge: RequestHandler = (req, res) => {
    const { alertId } = parseInput(alertParams, req.params);
    res.json(alerts.acknowledge(alertId));
  };

  const actions: RequestHandler = async (req, res) => {
    const { alertId } = parseInput(alertParams, req.params);
    res.json(await chief.alertActions(alertId));
  };

  return { acknowledge, actions };
}
