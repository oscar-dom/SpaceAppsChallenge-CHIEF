"""Guardrails applied to every answer before it leaves the agent."""

from .schemas import (
    ActionCategory,
    Alert,
    EscalationLevel,
    LlmAction,
    Medication,
    RecommendedAction,
)


def sanitize_actions(
    actions: list[LlmAction], formulary: list[Medication], max_actions: int
) -> list[RecommendedAction]:
    """Drop medication that is not in the formulary and cap the number of actions."""
    allowed = {med.id for med in formulary}
    result: list[RecommendedAction] = []
    for action in actions:
        medication_id = action.medication_id or None
        if action.category is ActionCategory.MEDICATION:
            if medication_id not in allowed:
                continue
        else:
            medication_id = None
        result.append(
            RecommendedAction(
                category=action.category,
                title=action.title.strip(),
                description=action.description.strip(),
                escalation=action.escalation,
                medication_id=medication_id,
            )
        )
    return result[:max_actions]


ESCALATION_ACTIONS = {
    EscalationLevel.CREW_MEDICAL_OFFICER: (
        "Report to the crew medical officer",
        "Share this result with the crew medical officer so they can assess it on board.",
    ),
    EscalationLevel.FLIGHT_SURGEON: (
        "Contact the flight surgeon",
        "Request a private medical conference with the flight surgeon on the ground "
        "and share this result.",
    ),
}


def enforce_escalation(
    actions: list[RecommendedAction], required: EscalationLevel
) -> list[RecommendedAction]:
    """Make sure the answer escalates at least as far as the rules engine requires."""
    if required is EscalationLevel.SELF_CARE:
        return actions
    if any(action.escalation.rank >= required.rank for action in actions):
        return actions
    title, description = ESCALATION_ACTIONS[required]
    escalate = RecommendedAction(
        category=ActionCategory.FOLLOW_UP,
        title=title,
        description=description,
        escalation=required,
    )
    return [escalate, *actions]


def highest_escalation(alerts: list[Alert]) -> EscalationLevel:
    levels = [a.escalation for a in alerts if not a.acknowledged]
    return max(levels, key=lambda level: level.rank, default=EscalationLevel.SELF_CARE)
