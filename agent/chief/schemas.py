"""Request and response bodies of the agent API.

They mirror the TypeScript types in shared/src (camelCase on the wire). The backend is
the only client: it builds the context (crew member, health, alerts, formulary) from
the rules engine and forwards it here.
"""

from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="ignore")


# --- Vocabulary (shared/src/status.ts, alerts.ts, chief.ts) ---------------------------


class Status(StrEnum):
    NOMINAL = "nominal"
    CAUTION = "caution"
    CRITICAL = "critical"


class EscalationLevel(StrEnum):
    SELF_CARE = "self-care"
    CREW_MEDICAL_OFFICER = "crew-medical-officer"
    FLIGHT_SURGEON = "flight-surgeon"

    @property
    def rank(self) -> int:
        return list(EscalationLevel).index(self)


class ActionCategory(StrEnum):
    TASK = "task"
    AVOID = "avoid"
    NUTRITION = "nutrition"
    EXERCISE = "exercise"
    SLEEP = "sleep"
    MEDICATION = "medication"
    FOLLOW_UP = "follow-up"


class AlertSeverity(StrEnum):
    CRITICAL = "critical"
    CAUTION = "caution"
    INFO = "info"


# --- Context sent by the backend -----------------------------------------------------


class CrewMember(CamelModel):
    id: str
    name: str
    role: str
    agency: str = ""
    age: int | None = None
    sex: str | None = None


class MissionClock(CamelModel):
    mission_day: int
    mission_length_days: int
    mission_time: str


class Metric(CamelModel):
    id: str
    system: str
    name: str
    unit: str
    description: str = ""


class Measurement(CamelModel):
    value: float
    taken_at: str
    simulated: bool = True


class MetricStatus(CamelModel):
    metric: Metric
    latest: Measurement | None = None
    status: Status
    trend: str = "stable"


class SystemStatus(CamelModel):
    system: str
    status: Status
    score: float
    metrics: list[MetricStatus] = Field(default_factory=list)


class HealthScore(CamelModel):
    crew_member_id: str
    score: float
    status: Status
    systems: list[SystemStatus] = Field(default_factory=list)
    computed_at: str


class Alert(CamelModel):
    id: str
    crew_member_id: str
    system: str
    kind: str
    severity: AlertSeverity
    title: str
    message: str
    escalation: EscalationLevel
    metric_id: str | None = None
    due_at: str | None = None
    created_at: str
    acknowledged: bool = False
    # Generic advice from the thresholds table, used when Gemini is unavailable.
    recommendation: str | None = None


class Medication(CamelModel):
    """An item of the onboard formulary: the only medication CHIEF may suggest."""

    id: str
    name: str
    indication: str
    dosage: str = ""
    notes: str = ""


class ChiefMessage(CamelModel):
    id: str = ""
    role: str  # "crew" | "chief"
    text: str
    created_at: str = ""


class RecommendedAction(CamelModel):
    category: ActionCategory
    title: str
    description: str
    escalation: EscalationLevel
    medication_id: str | None = None


# --- Endpoints -------------------------------------------------------------------------


class ChiefContext(CamelModel):
    crew_member: CrewMember
    mission_clock: MissionClock | None = None
    health: HealthScore
    alerts: list[Alert] = Field(default_factory=list)
    formulary: list[Medication] = Field(default_factory=list)


class ChatRequest(ChiefContext):
    """POST /chat"""

    message: str = Field(min_length=1, max_length=4000)
    history: list[ChiefMessage] = Field(default_factory=list)


class ChatResponse(CamelModel):
    reply: str
    actions: list[RecommendedAction]
    fallback: bool


class AlertActionsRequest(ChiefContext):
    """POST /alerts/actions"""

    alert: Alert


class AlertActionsResponse(CamelModel):
    alert_id: str
    summary: str
    actions: list[RecommendedAction]
    fallback: bool


class SttResponse(CamelModel):
    """POST /stt"""

    text: str
    language: str | None = None


class TtsRequest(CamelModel):
    """POST /tts, answered with audio/wav."""

    text: str = Field(min_length=1, max_length=2000)


class HealthCheckResponse(CamelModel):
    """GET /health"""

    status: str
    llm_configured: bool
    model: str
    tts_voice_available: bool


# --- Structured output requested from Gemini (plain field names, no aliases) ----------


class LlmAction(BaseModel):
    category: ActionCategory
    title: str
    description: str
    escalation: EscalationLevel
    medication_id: str | None = None


class LlmChatOutput(BaseModel):
    reply: str
    actions: list[LlmAction]


class LlmAlertOutput(BaseModel):
    summary: str
    actions: list[LlmAction]
