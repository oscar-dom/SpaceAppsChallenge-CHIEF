from chief.safety import enforce_escalation, sanitize_actions
from chief.schemas import (
    ActionCategory,
    EscalationLevel,
    LlmAction,
    Medication,
    RecommendedAction,
)

FORMULARY = [Medication(id="ibuprofen", name="Ibuprofen", indication="Pain")]


def action(category: str, medication_id: str | None = None, escalation: str = "self-care"):
    return LlmAction(
        category=ActionCategory(category),
        title="t",
        description="d",
        escalation=EscalationLevel(escalation),
        medication_id=medication_id,
    )


def test_drops_medication_outside_formulary() -> None:
    actions = [action("medication", "oxycodone"), action("medication", "ibuprofen")]
    result = sanitize_actions(actions, FORMULARY, max_actions=5)
    assert [a.medication_id for a in result] == ["ibuprofen"]


def test_drops_medication_without_id() -> None:
    assert sanitize_actions([action("medication")], FORMULARY, max_actions=5) == []


def test_clears_medication_id_on_other_categories() -> None:
    result = sanitize_actions([action("sleep", "ibuprofen")], FORMULARY, max_actions=5)
    assert result[0].medication_id is None


def test_caps_number_of_actions() -> None:
    result = sanitize_actions([action("task")] * 8, FORMULARY, max_actions=3)
    assert len(result) == 3


def test_adds_flight_surgeon_when_missing() -> None:
    actions = [
        RecommendedAction(
            category=ActionCategory.SLEEP,
            title="Rest",
            description="Sleep 8 h",
            escalation=EscalationLevel.CREW_MEDICAL_OFFICER,
        )
    ]
    result = enforce_escalation(actions, EscalationLevel.FLIGHT_SURGEON)
    assert result[0].escalation is EscalationLevel.FLIGHT_SURGEON
    assert len(result) == 2


def test_keeps_actions_when_escalation_is_met() -> None:
    actions = [
        RecommendedAction(
            category=ActionCategory.FOLLOW_UP,
            title="Call ground",
            description="Contact the flight surgeon",
            escalation=EscalationLevel.FLIGHT_SURGEON,
        )
    ]
    assert enforce_escalation(actions, EscalationLevel.CREW_MEDICAL_OFFICER) == actions
