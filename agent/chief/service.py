"""CHIEF's behaviour: ask the model, apply the guardrails, fall back when it fails."""

import logging

from .config import Settings
from .llm import LlmClient, LlmError, Turn
from .prompts import SYSTEM_PROMPT, alert_task, render_context
from .safety import enforce_escalation, highest_escalation, sanitize_actions
from .schemas import (
    ActionCategory,
    Alert,
    AlertActionsRequest,
    AlertActionsResponse,
    AlertSeverity,
    ChatRequest,
    ChatResponse,
    LlmAlertOutput,
    LlmChatOutput,
    RecommendedAction,
)

logger = logging.getLogger(__name__)

# Turns of previous conversation sent to the model.
MAX_HISTORY_TURNS = 12

SEVERITY_ORDER = {AlertSeverity.CRITICAL: 0, AlertSeverity.CAUTION: 1, AlertSeverity.INFO: 2}


class ChiefService:
    def __init__(self, settings: Settings, llm: LlmClient | None) -> None:
        self._settings = settings
        self._llm = llm
        self._system = SYSTEM_PROMPT.format(max_actions=settings.max_actions)

    async def chat(self, request: ChatRequest) -> ChatResponse:
        critical = [a for a in request.alerts if a.severity is AlertSeverity.CRITICAL]
        required = highest_escalation(critical)

        if self._llm is None:
            return self._chat_fallback(request)

        turns = [Turn("user", f"Current context:\n\n{render_context(request)}")]
        turns.append(Turn("model", '{"reply": "Context received.", "actions": []}'))
        for message in request.history[-MAX_HISTORY_TURNS:]:
            role = "model" if message.role == "chief" else "user"
            turns.append(Turn(role, message.text))
        turns.append(Turn("user", request.message))

        try:
            output = await self._llm.generate(self._system, turns, LlmChatOutput)
        except LlmError:
            logger.exception("Chat fell back to the rules engine")
            return self._chat_fallback(request)

        actions = sanitize_actions(output.actions, request.formulary, self._settings.max_actions)
        return ChatResponse(
            reply=output.reply.strip(),
            actions=enforce_escalation(actions, required),
            fallback=False,
        )

    async def alert_actions(self, request: AlertActionsRequest) -> AlertActionsResponse:
        alert = request.alert
        if self._llm is None:
            return self._alert_fallback(alert)

        turns = [Turn("user", f"{render_context(request)}\n\n{alert_task(alert)}")]
        try:
            output = await self._llm.generate(self._system, turns, LlmAlertOutput)
        except LlmError:
            logger.exception("Alert actions fell back to the rules engine")
            return self._alert_fallback(alert)

        actions = sanitize_actions(output.actions, request.formulary, self._settings.max_actions)
        return AlertActionsResponse(
            alert_id=alert.id,
            summary=output.summary.strip(),
            actions=enforce_escalation(actions, alert.escalation),
            fallback=False,
        )

    # --- Fallback: answers built only from the rules engine output -------------------

    def _chat_fallback(self, request: ChatRequest) -> ChatResponse:
        health = request.health
        active = sorted(
            (a for a in request.alerts if not a.acknowledged),
            key=lambda a: SEVERITY_ORDER[a.severity],
        )
        reply = (
            "My reasoning module is offline, so I can only report the onboard rules engine. "
            f"Your health score is {health.score:.0f}/100 ({health.status})."
        )
        if active:
            reply += f" You have {len(active)} active alert(s); the most urgent is: "
            reply += f"{active[0].title}."
        else:
            reply += " There are no active alerts."

        actions = [_action_from_alert(a) for a in active[: self._settings.max_actions]]
        critical = [a for a in active if a.severity is AlertSeverity.CRITICAL]
        return ChatResponse(
            reply=reply,
            actions=enforce_escalation(actions, highest_escalation(critical)),
            fallback=True,
        )

    def _alert_fallback(self, alert: Alert) -> AlertActionsResponse:
        return AlertActionsResponse(
            alert_id=alert.id,
            summary=alert.message,
            actions=enforce_escalation([_action_from_alert(alert)], alert.escalation),
            fallback=True,
        )


def _action_from_alert(alert: Alert) -> RecommendedAction:
    return RecommendedAction(
        category=ActionCategory.FOLLOW_UP,
        title=alert.title,
        description=alert.recommendation or alert.message,
        escalation=alert.escalation,
    )
