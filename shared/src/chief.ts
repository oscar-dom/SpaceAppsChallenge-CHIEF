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
