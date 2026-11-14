import { randomUUID } from 'node:crypto';
import type {
  AgentChatResponse,
  AgentContext,
  Alert,
  AlertActionsResponse,
  ChiefChatRequest,
  ChiefChatResponse,
  RecommendedAction,
} from '@chief/shared';
import type { Logger } from 'pino';
import type { AgentClient } from './agent/client.js';
import type { AlertsService } from './alerts.service.js';
import type { CrewService } from './crew.service.js';
import type { HealthService } from './health.service.js';
import type { MissionClock } from './mission-clock.js';

/**
 * Builds CHIEF's context from the rules engine and talks to the agent. If the agent cannot
 * be reached the app keeps working: the answer is built from the open alerts and the
 * generic advice of the thresholds table, with `fallback: true` (CLAUDE.md, CHIEF rules).
 */
export class ChiefService {
  constructor(
    private readonly clock: MissionClock,
    private readonly crew: CrewService,
    private readonly health: HealthService,
    private readonly alerts: AlertsService,
    private readonly agent: AgentClient,
    private readonly logger: Logger,
  ) {}

  async chat(request: ChiefChatRequest): Promise<ChiefChatResponse> {
    const context = this.context(request.crewMemberId);
    let answer: AgentChatResponse;
    try {
      answer = await this.agent.chat({
        ...context,
        message: request.message,
        history: request.history,
      });
    } catch (error) {
      this.logger.warn({ err: error }, 'CHIEF agent unavailable, answering with the fallback');
      answer = { ...chatFallback(context.alerts), fallback: true, model: null };
    }
    return {
      reply: {
        id: randomUUID(),
        role: 'chief',
        text: answer.reply,
        createdAt: new Date().toISOString(),
      },
      actions: answer.actions,
      fallback: answer.fallback,
      model: answer.model,
    };
  }

  async alertActions(alertId: string): Promise<AlertActionsResponse> {
    const alert = this.alerts.find(alertId);
    const context = this.context(alert.crewMemberId);
    try {
      return await this.agent.alertActions({ ...context, alert });
    } catch (error) {
      this.logger.warn({ err: error }, 'CHIEF agent unavailable, answering with the fallback');
      return {
        alertId: alert.id,
        summary: alert.message,
        actions: [fallbackAction(alert)],
        fallback: true,
        model: null,
      };
    }
  }

  speechToText(audio: Buffer, contentType: string): Promise<{ text: string }> {
    return this.agent.speechToText(audio, contentType);
  }

  textToSpeech(text: string): Promise<Buffer> {
    return this.agent.textToSpeech(text);
  }

  /** Everything CHIEF knows about a crew member, built from the rules engine. */
  private context(crewId: string): AgentContext {
    return {
      crewMember: this.crew.get(crewId),
      missionClock: this.clock.snapshot(),
      health: this.health.evaluate(crewId).health,
      alerts: this.alerts.list(crewId),
      formulary: this.crew.formulary(),
    };
  }
}

/** Action built from the generic advice of the thresholds table. */
function fallbackAction(alert: Alert): RecommendedAction {
  return {
    category: alert.kind === 'scheduled' ? 'task' : 'follow-up',
    title: alert.title,
    description: alert.recommendation ?? alert.message,
    escalation: alert.escalation,
  };
}

/** Answer when the agent cannot be reached: the open anomalies and their generic advice. */
function chatFallback(alerts: Alert[]): { reply: string; actions: RecommendedAction[] } {
  const pending = alerts.filter((a) => !a.acknowledged && a.kind === 'anomaly');
  if (pending.length === 0) {
    return {
      reply:
        'CHIEF is offline right now. The health system shows no open anomalies for you. ' +
        'If you feel unwell, contact the crew medical officer.',
      actions: [],
    };
  }
  const titles = pending.map((a) => a.title.toLowerCase()).join(', ');
  return {
    reply:
      "CHIEF is offline right now, so this is the health system's standard advice. " +
      `Open alerts: ${titles}. Follow the actions below and contact the crew medical ` +
      'officer if anything gets worse.',
    actions: pending.slice(0, 5).map(fallbackAction),
  };
}
