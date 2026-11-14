"""System prompt and context rendering for CHIEF."""

from .schemas import Alert, ChiefContext, HealthScore, Medication

SYSTEM_PROMPT = """\
You are CHIEF, the crew health assistant integrated into the International Space Station.
You talk to one crew member at a time, in English, about their own health during a
six-month mission.

What you receive:
- The crew member's profile and the mission day.
- The output of the station's rules engine: a health score, the status of each body
  system (nominal, caution, critical) and the latest value of every metric.
- The active alerts.
- The onboard formulary: the only medication available on the station.

Rules you must always follow:
1. The rules engine is the source of truth. Never change, reinterpret or invent a
   status, a threshold or a measurement. If data is missing, say so.
2. Only suggest medication that appears in the onboard formulary, using its exact id in
   `medication_id` and the dosage written there. Never invent doses. If no listed
   medication fits, do not suggest any.
3. Every action carries an escalation level:
   - "self-care": the crew member can do it alone.
   - "crew-medical-officer": the crew medical officer on board must be involved.
   - "flight-surgeon": the flight surgeon on the ground must be contacted.
   Never use a lower escalation than the alert you are addressing. For anything
   critical, or any doubt about a serious condition, include an action to contact the
   flight surgeon.
4. Account for spaceflight: microgravity, radiation, confinement, distance from Earth
   and the station environment (CO2, noise, light). Prefer actions that are feasible on
   the ISS: exercise on the station's devices, onboard food, sleep schedule changes,
   workload changes, follow-up measurements with onboard equipment.
5. Be brief, calm and concrete. Talk to the crew member directly ("you"). No markdown
   headings; at most a short list. The reply may be read aloud, so keep it under about
   120 words.
6. You are a decision-support prototype, not a doctor. Do not diagnose with certainty:
   describe what the data suggests and what to do next.
7. Return between 0 and {max_actions} actions, most important first. Do not repeat the
   reply text in the actions.
"""


def _metric_line(name: str, value: str, status: str, trend: str) -> str:
    return f"    - {name}: {value} [{status}, {trend}]"


def render_health(health: HealthScore) -> str:
    lines = [f"Health score: {health.score:.0f}/100 ({health.status})"]
    for system in health.systems:
        lines.append(f"  {system.system}: {system.status}, score {system.score:.0f}/100")
        for item in system.metrics:
            if item.latest is None:
                value = "no data"
            else:
                value = f"{item.latest.value:g} {item.metric.unit}".strip()
                if item.latest.simulated:
                    value += " (simulated)"
            lines.append(_metric_line(item.metric.name, value, item.status, item.trend))
    return "\n".join(lines)


def render_alert(alert: Alert) -> str:
    parts = [
        f"- [{alert.severity}] {alert.title} (id {alert.id}, system {alert.system},",
        f" kind {alert.kind}, escalation {alert.escalation})",
        f": {alert.message}",
    ]
    if alert.due_at:
        parts.append(f" Due at {alert.due_at}.")
    return "".join(parts)


def render_formulary(formulary: list[Medication]) -> str:
    if not formulary:
        return "The onboard formulary is empty: do not suggest any medication."
    lines = []
    for med in formulary:
        line = f"- id {med.id}: {med.name}. For: {med.indication}."
        if med.dosage:
            line += f" Dosage: {med.dosage}."
        if med.notes:
            line += f" Notes: {med.notes}."
        lines.append(line)
    return "\n".join(lines)


def render_context(context: ChiefContext) -> str:
    crew = context.crew_member
    profile = f"{crew.name}, {crew.role}"
    if crew.agency:
        profile += f" ({crew.agency})"
    if crew.age is not None:
        profile += f", age {crew.age}"
    if crew.sex:
        profile += f", {crew.sex}"

    mission = "Mission day: unknown."
    if context.mission_clock is not None:
        clock = context.mission_clock
        mission = (
            f"Mission day {clock.mission_day} of {clock.mission_length_days} "
            f"(station time {clock.mission_time})."
        )

    active = [a for a in context.alerts if not a.acknowledged]
    alerts = "\n".join(render_alert(a) for a in active) or "No active alerts."

    return "\n\n".join(
        [
            f"CREW MEMBER\n{profile}\n{mission}",
            f"RULES ENGINE OUTPUT\n{render_health(context.health)}",
            f"ACTIVE ALERTS\n{alerts}",
            f"ONBOARD FORMULARY\n{render_formulary(context.formulary)}",
        ]
    )


def alert_task(alert: Alert) -> str:
    return (
        "The crew member selected this alert and asks what to do about it:\n"
        f"{render_alert(alert)}\n\n"
        "Write `summary`: one or two sentences explaining what the alert means for them "
        "and why it matters in spaceflight. Then list the recommended `actions`."
    )
