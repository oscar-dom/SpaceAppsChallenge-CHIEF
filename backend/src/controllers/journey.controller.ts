import type { RequestHandler } from 'express';
import { z } from 'zod';
import { parseInput } from '../middlewares/validate.js';
import type { Services } from '../services/index.js';

const stageParams = z.object({ index: z.coerce.number().int().min(1).max(10) });
const itemParams = z.object({ itemId: z.string().regex(/^[a-z0-9-]{1,64}$/, 'Invalid item id') });
const adjustBody = z
  .object({
    delta: z
      .number()
      .finite()
      .refine((n) => n !== 0, 'delta cannot be zero')
      .refine((n) => Math.abs(n) <= 100_000, 'delta is too large'),
    note: z.string().max(200).optional(),
    crewMemberId: z
      .string()
      .regex(/^C\d{3}$/, 'Invalid crew member id')
      .optional(),
  })
  .strict();

/** JOURNEY: the mission route and the ship's inventory. */
export function journeyController({ journey, inventory }: Services) {
  const route: RequestHandler = (_req, res) => {
    res.json(journey.journey());
  };

  const stageInventory: RequestHandler = (req, res) => {
    const { index } = parseInput(stageParams, req.params);
    res.json(journey.stageInventory(index));
  };

  const stocks: RequestHandler = (_req, res) => {
    res.json(inventory.stocks());
  };

  const history: RequestHandler = (req, res) => {
    const { itemId } = parseInput(itemParams, req.params);
    res.json(inventory.history(itemId));
  };

  const adjust: RequestHandler = (req, res) => {
    const { itemId } = parseInput(itemParams, req.params);
    const body = parseInput(adjustBody, req.body);
    res.json(inventory.adjust(itemId, body));
  };

  return { route, stageInventory, stocks, history, adjust };
}
