import type {
  Alert,
  AlertActionsResponse,
  ApiError,
  ChiefChatRequest,
  ChiefChatResponse,
  CrewMember,
  HealthScore,
  InventoryAdjustRequest,
  InventoryHistory,
  InventoryStock,
  Journey,
  Measurement,
  Metric,
  MissionClock,
  Period,
  StageInventory,
  Threshold,
} from '@chief/shared';
import { API_PREFIX } from '@chief/shared';

/** REST client for the backend. The frontend never talks to the agent or Gemini directly. */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(API_PREFIX + path, init);
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      message = ((await res.json()) as ApiError).error.message || message;
    } catch {
      // Body is not an ApiError: keep the status message.
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

const post = <T>(path: string, body?: unknown) =>
  request<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

export const api = {
  crew: () => request<CrewMember[]>('/crew'),
  clock: () => request<MissionClock>('/mission/clock'),
  metrics: () => request<Metric[]>('/metrics'),
  thresholds: () => request<Threshold[]>('/thresholds'),
  health: (crewId: string) => request<HealthScore>(`/crew/${crewId}/health`),
  alerts: (crewId: string) => request<Alert[]>(`/crew/${crewId}/alerts`),
  measurements: (crewId: string, metricId: string, period: Period) =>
    request<Measurement[]>(
      `/crew/${crewId}/measurements?metricId=${encodeURIComponent(metricId)}&period=${period}`,
    ),
  acknowledge: (alertId: string) => post<Alert>(`/alerts/${alertId}/acknowledge`),
  alertActions: (alertId: string) => post<AlertActionsResponse>(`/alerts/${alertId}/actions`),
  chat: (body: ChiefChatRequest) => post<ChiefChatResponse>('/chief/chat', body),
  journey: () => request<Journey>('/journey'),
  stageInventory: (index: number) => request<StageInventory>(`/journey/stages/${index}/inventory`),
  inventory: () => request<InventoryStock[]>('/inventory'),
  inventoryHistory: (itemId: string) => request<InventoryHistory>(`/inventory/${itemId}/history`),
  adjustInventory: (itemId: string, body: InventoryAdjustRequest) =>
    post<InventoryStock>(`/inventory/${itemId}/adjust`, body),

  /** Speech to text through the backend (faster-whisper in the agent). */
  async stt(audio: Blob): Promise<string> {
    const res = await fetch(`${API_PREFIX}/chief/stt`, {
      method: 'POST',
      headers: { 'Content-Type': audio.type || 'audio/webm' },
      body: audio,
    });
    if (!res.ok) throw new Error(`Speech to text failed (${res.status})`);
    return ((await res.json()) as { text: string }).text;
  },

  /** Text to speech through the backend (Piper in the agent): a WAV blob. */
  async tts(text: string): Promise<Blob> {
    const res = await fetch(`${API_PREFIX}/chief/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error(`Text to speech failed (${res.status})`);
    return res.blob();
  },
};
