import type { RequestHandler } from 'express';
import { z } from 'zod';
import { ValidationError } from '../errors/app-error.js';
import { parseInput } from '../middlewares/validate.js';
import type { Services } from '../services/index.js';

/** Same limits as the agent (agent/chief/schemas.py). */
const chatBody = z.object({
  crewMemberId: z.string().regex(/^C\d{3}$/, 'Invalid crew member id'),
  message: z.string().trim().min(1).max(4000),
  history: z
    .array(
      z.object({
        id: z.string(),
        role: z.enum(['crew', 'chief']),
        text: z.string(),
        createdAt: z.string(),
      }),
    )
    .max(50)
    .default([]),
});

const ttsBody = z.object({ text: z.string().trim().min(1).max(2000) });

export function chiefController({ chief, crew }: Services) {
  const chat: RequestHandler = async (req, res) => {
    const body = parseInput(chatBody, req.body);
    crew.get(body.crewMemberId);
    res.json(await chief.chat(body));
  };

  /** The browser sends the recording as the raw body (e.g. Content-Type: audio/webm). */
  const speechToText: RequestHandler = async (req, res) => {
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      throw new ValidationError('Send the recording as the request body with an audio/* type');
    }
    res.json(await chief.speechToText(req.body, req.get('content-type') ?? 'audio/webm'));
  };

  const textToSpeech: RequestHandler = async (req, res) => {
    const { text } = parseInput(ttsBody, req.body);
    const audio = await chief.textToSpeech(text);
    res.type('audio/wav').send(audio);
  };

  return { chat, speechToText, textToSpeech };
}
