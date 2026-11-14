import type { Alert } from './alerts.js';
import type { MissionClock } from './crew.js';
import type { HealthScore } from './health.js';
import type { Measurement } from './metrics.js';

/**
 * REST routes of the backend (prefix /api). Responses use the types in this package.
 * Proposed during the contracts phase: agree on changes before merging them.
 *
 * GET  /api/crew                                   → CrewMember[]
 * GET  /api/mission/clock                          → MissionClock
 * GET  /api/metrics                                → Metric[]
 * GET  /api/thresholds                             → Threshold[]
 * GET  /api/crew/:crewId/health                    → HealthScore
 * GET  /api/crew/:crewId/systems/:systemId         → SystemStatus
 * GET  /api/crew/:crewId/measurements?metricId=&period=  → Measurement[]
 * GET  /api/crew/:crewId/alerts                    → Alert[]
 * POST /api/alerts/:alertId/acknowledge            → Alert
 * POST /api/alerts/:alertId/actions                → AlertActionsResponse
 * POST /api/chief/chat                             → ChiefChatResponse
 * POST /api/chief/stt   (audio)                    → { text: string }
 * POST /api/chief/tts   { text }                   → audio
 */
export const API_PREFIX = '/api';

/** Error body returned by every failing request. */
export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}

/** Socket.IO events sent by the backend. */
export interface ServerToClientEvents {
  'mission:clock': (clock: MissionClock) => void;
  'measurement:new': (measurement: Measurement) => void;
  'health:updated': (health: HealthScore) => void;
  'alert:new': (alert: Alert) => void;
  'alert:updated': (alert: Alert) => void;
}

/** Socket.IO events sent by the frontend. */
export interface ClientToServerEvents {
  /** Receive live data only for the crew member shown in the UI. */
  'crew:select': (crewMemberId: string) => void;
}
