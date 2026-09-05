"""API contract tests: validation, response envelope, and error handling."""
import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


class TestHealth:
    def test_root_reports_ok(self):
        r = client.get("/")
        assert r.status_code == 200
        assert r.json()["status"] == "ok"


class TestMessageValidation:
    def test_rejects_empty_text(self):
        assert client.post("/predict/message", json={"text": ""}).status_code == 422

    def test_rejects_missing_field(self):
        assert client.post("/predict/message", json={}).status_code == 422

    def test_rejects_overlong_text(self):
        assert client.post("/predict/message", json={"text": "x" * 2001}).status_code == 422


class TestTransactionValidation:
    @pytest.mark.parametrize("payload,reason", [
        ({"hour": 24, "amount": 100}, "hour above 23"),
        ({"hour": -1, "amount": 100}, "negative hour"),
        ({"hour": 12, "amount": 0}, "amount must be > 0"),
        ({"hour": 12, "amount": -50}, "negative amount"),
        ({"amount": 100}, "hour required"),
        ({"hour": 12}, "amount required"),
    ])
    def test_rejects_invalid_input(self, payload, reason):
        assert client.post("/predict/transaction", json=payload).status_code == 422, reason

    def test_accepts_valid_shape(self):
        r = client.post("/predict/transaction", json={"hour": 14, "amount": 500})
        assert r.status_code != 422


class TestUpiRequestEndpoint:
    def test_requires_payee_vpa(self):
        assert client.post("/predict/upi-request", json={}).status_code == 422

    def test_returns_scored_response(self):
        r = client.post("/predict/upi-request", json={
            "payee_vpa": "refund@upi", "is_collect_request": True,
            "payee_verified": False, "requested_amount": 1,
        })
        assert r.status_code == 200
        body = r.json()
        assert set(body) >= {"risk_score", "risk_level", "triggered_rules", "explanation"}
        assert body["risk_level"] in {"low", "medium", "high"}
        assert 0 <= body["risk_score"] <= 1
        assert "collect_request" in body["triggered_rules"]

    def test_clean_request_scores_low(self):
        r = client.post("/predict/upi-request", json={
            "payee_vpa": "friend@okhdfcbank", "is_collect_request": False,
            "payee_verified": True, "requested_amount": 500,
        })
        assert r.json()["risk_level"] == "low"


class TestChatEndpoint:
    def test_rejects_empty_message_list(self):
        assert client.post("/chat", json={"messages": []}).status_code in (400, 500)

    def test_does_not_leak_internal_errors(self):
        """Regression guard: /chat once returned raw exception text containing the API key."""
        r = client.post("/chat", json={"messages": [{"role": "user", "content": "hi"}]})
        body = str(r.json())
        assert "AIza" not in body
        assert "AQ.Ab8" not in body
        assert "Traceback" not in body
