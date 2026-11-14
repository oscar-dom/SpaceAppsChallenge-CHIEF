from typing import Any

from conftest import FakeLlm, make_client


def test_health_reports_configuration() -> None:
    response = make_client(None).get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["llmConfigured"] is False


def test_chat_uses_llm_and_returns_camel_case(context: dict[str, Any]) -> None:
    llm = FakeLlm(
        {
            "reply": "Your vitamin D is low.",
            "actions": [
                {
                    "category": "medication",
                    "title": "Take vitamin D3",
                    "description": "800 IU daily with a meal.",
                    "escalation": "crew-medical-officer",
                    "medication_id": "vit-d3",
                }
            ],
        }
    )
    body = {**context, "message": "How is my vitamin D?", "history": []}
    response = make_client(llm).post("/chat", json=body)

    assert response.status_code == 200
    data = response.json()
    assert data["fallback"] is False
    assert data["reply"] == "Your vitamin D is low."
    assert data["actions"][0]["medicationId"] == "vit-d3"

    system, turns = llm.calls[0]
    assert "onboard formulary" in system.lower()
    assert "Serum vitamin D: 18 ng/mL (simulated) [caution, falling]" in turns[0].text
    assert "id vit-d3: Vitamin D3" in turns[0].text
    assert turns[-1].text == "How is my vitamin D?"


def test_chat_maps_history_roles(context: dict[str, Any]) -> None:
    llm = FakeLlm({"reply": "ok", "actions": []})
    history = [
        {"id": "1", "role": "crew", "text": "Hi", "createdAt": ""},
        {"id": "2", "role": "chief", "text": "Hello", "createdAt": ""},
    ]
    make_client(llm).post("/chat", json={**context, "message": "Next", "history": history})
    roles = [turn.role for turn in llm.calls[0][1]]
    assert roles == ["user", "model", "user", "model", "user"]


def test_chat_falls_back_when_llm_fails(context: dict[str, Any]) -> None:
    body = {**context, "message": "How am I?", "history": []}
    response = make_client(FakeLlm(fail=True)).post("/chat", json=body)

    data = response.json()
    assert response.status_code == 200
    assert data["fallback"] is True
    assert "71/100" in data["reply"]
    assert data["actions"][0]["description"].startswith("Take the vitamin D supplement")


def test_chat_without_api_key_uses_fallback(context: dict[str, Any]) -> None:
    body = {**context, "message": "How am I?", "history": []}
    data = make_client(None).post("/chat", json=body).json()
    assert data["fallback"] is True


def test_alert_actions_enforce_escalation(context: dict[str, Any]) -> None:
    llm = FakeLlm(
        {
            "summary": "Low vitamin D weakens bones in microgravity.",
            "actions": [
                {
                    "category": "nutrition",
                    "title": "Eat fortified food",
                    "description": "Choose vitamin D fortified items.",
                    "escalation": "self-care",
                }
            ],
        }
    )
    body = {**context, "alert": context["alerts"][0]}
    data = make_client(llm).post("/alerts/actions", json=body).json()

    assert data["alertId"] == "alert-1"
    assert data["fallback"] is False
    assert data["actions"][0]["title"] == "Report to the crew medical officer"
    assert data["actions"][0]["escalation"] == "crew-medical-officer"


def test_alert_actions_fallback(context: dict[str, Any]) -> None:
    body = {**context, "alert": context["alerts"][0]}
    data = make_client(FakeLlm(fail=True)).post("/alerts/actions", json=body).json()
    assert data["fallback"] is True
    assert data["summary"] == "Serum vitamin D is 18 ng/mL and falling."
    assert data["actions"][0]["escalation"] == "crew-medical-officer"


def test_rejects_invalid_body() -> None:
    response = make_client(None).post("/chat", json={"message": "hi"})
    assert response.status_code == 422


def test_tts_reports_missing_voice(tmp_path: Any) -> None:
    from fastapi.testclient import TestClient

    from chief.api import create_app
    from chief.config import Settings

    settings = Settings(_env_file=None, piper_voice_path=tmp_path / "missing.onnx")
    client = TestClient(create_app(settings=settings))
    response = client.post("/tts", json={"text": "Hello"})
    assert response.status_code == 503
