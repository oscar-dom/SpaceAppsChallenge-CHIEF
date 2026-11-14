import { ACTION_CATEGORIES, ESCALATION_LEVELS, type AlertActionsResponse } from '@chief/shared';
import { z } from 'zod';
import { AgentUnavailableError, AppError } from '../../errors/app-error.js';
import type {
  AgentAlertActionsRequest,
  AgentChatRequest,
  AgentChatResponse,
} from '@chief/shared';

const actionSchema = z.object({
  category: z.enum(ACTION_CATEGORIES),
  title: z.string(),
  description: z.string(),
  escalation: z.enum(ESCALATION_LEVELS),
  medicationId: z.string().nullish().transform((id) => id ?? undefined),
});

/** Gemini model that answered; null in fallback mode (missing in older agents). */
const modelSchema = z.string().nullish().transform((model) => model ?? null);

const chatResponseSchema = z.object({
  reply: z.string(),
  actions: z.array(actionSchema),
  fallback: z.boolean(),
  model: modelSchema,
});

const alertActionsResponseSchema = z.object({
  alertId: z.string(),
  summary: z.string(),
  actions: z.array(actionSchema),
  fallback: z.boolean(),
  model: modelSchema,
});

const sttResponseSchema = z.object({ text: z.string() });

/** The agent answered with an error status. 4xx errors are the client's fault. */
export class AgentHttpError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
  ) {
    super(`Agent answered ${status}: ${detail}`);
  }
}

/** HTTP client of the Python agent (agent/README.md). Only the backend talks to it. */
export class AgentClient {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs: number,
  ) {}

  async chat(body: AgentChatRequest): Promise<AgentChatResponse> {
    const data = await this.postJson('/chat', body);
    return chatResponseSchema.parse(data);
  }

  async alertActions(body: AgentAlertActionsRequest): Promise<AlertActionsResponse> {
    const data = await this.postJson('/alerts/actions', body);
    return alertActionsResponseSchema.parse(data);
  }

  /** Speech to text. Errors become AppErrors: there is no fallback for voice. */
  async speechToText(audio: Buffer, contentType: string): Promise<{ text: string }> {
    const form = new FormData();
    form.append('audio', new Blob([new Uint8Array(audio)], { type: contentType }), 'audio');
    const response = await this.voiceRequest('/stt', { method: 'POST', body: form });
    return sttResponseSchema.parse(await response.json());
  }

  /** Text to speech: WAV audio. */
  async textToSpeech(text: string): Promise<Buffer> {
    const response = await this.voiceRequest('/tts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    return Buffer.from(await response.arrayBuffer());
  }

  private async postJson(path: string, body: unknown): Promise<unknown> {
    const response = await this.request(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new AgentHttpError(response.status, await errorDetail(response));
    return response.json();
  }

  private async voiceRequest(path: string, init: RequestInit): Promise<Response> {
    let response: Response;
    try {
      response = await this.request(path, init);
    } catch {
      throw new AgentUnavailableError();
    }
    if (response.ok) return response;
    const detail = await errorDetail(response);
    if (response.status >= 400 && response.status < 500 && response.status !== 404) {
      throw new AppError(response.status === 413 ? 413 : 400, 'INVALID_AUDIO', detail);
    }
    throw new AgentUnavailableError(`CHIEF voice service failed: ${detail}`);
  }

  private request(path: string, init: RequestInit): Promise<Response> {
    return fetch(`${this.baseUrl}${path}`, {
      ...init,
      signal: AbortSignal.timeout(this.timeoutMs),
    });
  }
}

/** FastAPI errors look like {"detail": "..."}; fall back to the status text. */
async function errorDetail(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    return typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail);
  } catch {
    return response.statusText || `HTTP ${response.status}`;
  }
}
