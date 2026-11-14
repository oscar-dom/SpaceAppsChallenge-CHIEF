import type { Alert } from './alerts.js';
import type { CrewMember, MissionClock } from './crew.js';
import type { HealthScore } from './health.js';
import type { EscalationLevel } from './status.js';

/**
 * Types for talking to CHIEF through the backend. The backend forwards them to the
 * Python agent, whose JSON schemas (agent/README.md) must match these shapes.
 */

export interface ChiefMessage {
  id: string;
  role: 'crew' | 'chief';
  text: string;
  /** Real time of the message, ISO 8601. */
  createdAt: string;
}

export const ACTION_CATEGORIES = [
  'task',
  'avoid',
  'nutrition',
  'exercise',
  'sleep',
  'medication',
  'follow-up',
] as const;
export type ActionCategory = (typeof ACTION_CATEGORIES)[number];

/** A concrete step CHIEF recommends. */
export interface RecommendedAction {
  category: ActionCategory;
  title: string;
  description: string;
  escalation: EscalationLevel;
  /** Id in the onboard formulary, only for `medication` actions. */
  medicationId?: string;
}

/** POST /api/chief/chat */
export interface ChiefChatRequest {
  crewMemberId: string;
  message: string;
  /** Previous turns of the conversation, oldest first. */
  history: ChiefMessage[];
}

export interface ChiefChatResponse {
  reply: ChiefMessage;
  actions: RecommendedAction[];
  /** True when Gemini failed and the reply comes from the rules engine fallback. */
  fallback: boolean;
}

/** POST /api/alerts/:alertId/actions */
export interface AlertActionsResponse {
  alertId: string;
  summary: string;
  actions: RecommendedAction[];
  fallback: boolean;
}

/** An item of the onboard formulary: the only medication CHIEF may suggest. */
export interface Medication {
  id: string;
  name: string;
  /** What it is used for, e.g. "Mild to moderate pain, headache". */
  indication: string;
  /** e.g. "400 mg every 8 h with food, max 1200 mg/day". */
  dosage?: string;
  notes?: string;
}

/**
 * Backend → agent (Python, agent/). The backend builds this context from the rules
 * engine and the database; the agent never reads the database itself.
 */
export interface AgentContext {
  crewMember: CrewMember;
  missionClock?: MissionClock;
  health: HealthScore;
  /** Alerts of this crew member; acknowledged ones are ignored by the agent. */
  alerts: Alert[];
  formulary: Medication[];
}

/** POST {AGENT_URL}/chat */
export interface AgentChatRequest extends AgentContext {
  message: string;
  history: ChiefMessage[];
}

/** Answer of POST {AGENT_URL}/chat. The backend wraps `reply` into a ChiefMessage. */
export interface AgentChatResponse {
  reply: string;
  actions: RecommendedAction[];
  fallback: boolean;
}

/** POST {AGENT_URL}/alerts/actions, answered with AlertActionsResponse. */
export interface AgentAlertActionsRequest extends AgentContext {
  alert: Alert;
}
