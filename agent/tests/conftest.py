from typing import Any

import pytest
from fastapi.testclient import TestClient
from pydantic import BaseModel

from chief.api import create_app
from chief.config import Settings
from chief.llm import LlmError, Turn


class FakeLlm:
    """Returns a preset output (or raises) and records what it was asked."""

    def __init__(self, output: dict[str, Any] | None = None, fail: bool = False) -> None:
        self.output = output or {}
        self.fail = fail
        self.calls: list[tuple[str, list[Turn]]] = []

    async def generate(self, system: str, turns: list[Turn], schema: type[BaseModel]) -> Any:
        self.calls.append((system, turns))
        if self.fail:
            raise LlmError("fake failure")
        return schema.model_validate(self.output)


def make_client(llm: FakeLlm | None) -> TestClient:
    settings = Settings(_env_file=None, gemini_api_key="")
    return TestClient(create_app(settings=settings, llm=llm))


@pytest.fixture
def context() -> dict[str, Any]:
    """A request body as the backend sends it (camelCase, shared/ types)."""
    return {
        "crewMember": {
            "id": "crew-1",
            "name": "Alex Rivera",
            "role": "Flight Engineer",
            "agency": "NASA",
            "age": 41,
            "sex": "female",
        },
        "missionClock": {
            "missionDay": 92,
            "missionLengthDays": 180,
            "missionTime": "2026-08-20T09:00:00Z",
            "timeScale": 3600,
        },
        "health": {
            "crewMemberId": "crew-1",
            "score": 71,
            "status": "caution",
            "computedAt": "2026-08-20T09:00:00Z",
            "systems": [
                {
                    "system": "nutrition",
                    "status": "caution",
                    "score": 60,
                    "metrics": [
                        {
                            "metric": {
                                "id": "vitamin-d",
                                "system": "nutrition",
                                "name": "Serum vitamin D",
                                "unit": "ng/mL",
                                "description": "25-hydroxyvitamin D",
                                "origin": "lab",
                                "cadenceMinutes": 43200,
                            },
                            "latest": {
                                "id": "m-1",
                                "crewMemberId": "crew-1",
                                "metricId": "vitamin-d",
                                "value": 18,
                                "takenAt": "2026-08-19T08:00:00Z",
                                "simulated": True,
                            },
                            "status": "caution",
                            "trend": "falling",
                        }
                    ],
                }
            ],
        },
        "alerts": [
            {
                "id": "alert-1",
                "crewMemberId": "crew-1",
                "system": "nutrition",
                "kind": "anomaly",
                "severity": "caution",
                "title": "Low vitamin D",
                "message": "Serum vitamin D is 18 ng/mL and falling.",
                "escalation": "crew-medical-officer",
                "metricId": "vitamin-d",
                "createdAt": "2026-08-19T08:05:00Z",
                "acknowledged": False,
                "recommendation": "Take the vitamin D supplement from the onboard kit.",
            }
        ],
        "formulary": [
            {
                "id": "vit-d3",
                "name": "Vitamin D3",
                "indication": "Vitamin D supplementation",
                "dosage": "800 IU daily",
            }
        ],
    }
