"""
API contract tests.

These cover request validation, error handling and the response envelope -
the parts of the API that must stay stable for the frontend and the browser
extension. They deliberately avoid asserting on model *scores*, so they run
in CI without a training pass (see the lazy loading in app/ml/predict.py).
"""

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
        r = client.post("/predict/message", json={"text": "x" * 2001})
        assert r.status_code == 422


class TestTransactionValidation:
    @pytest.mark.parametrize("payload,reason", [
        ({"hour": 24, "amount": 100}, "hour above 23"),
        ({"hour": -1, "amount": 100}, "negative hour"),
        ({"hour": 12, "amount": 0}, "amount must be > 0"),
        ({"hour": 12, "amount": -50}, "negative amount"),
        ({"amount": 100}, "hour is required"),
        ({"hour": 12}, "amount is required"),
    ])
    def test_rejects_invalid_input(self, payload, reason):
        assert client.post("/predict/transaction", json=payload).status_code == 422, reason

    def test_accepts_valid_shape(self):
        """Should not be a validation error (may 500 if models absent - that's fine here)."""
        r = client.post("/predict/transaction", json={"hour": 14, "amount": 500})
        assert r.status_code != 422


class TestUpiRequestEndpoint:
    def test_requires_payee_vpa(self):
        assert client.post("/predict/upi-request", json={}).status_code == 422

    def test_returns_scored_response(self):
        """UPI scoring is pure rules - no model artifacts needed, so this must work."""
        r = client.post("/predict/upi-request", json={
            "payee_vpa": "refund@upi",
            "is_collect_request": True,
            "payee_verified": False,
            "requested_amount": 1,
        })
        assert r.status_code == 200
        body = r.json()
        assert set(body) >= {"risk_score", "risk_level", "triggered_rules", "explanation"}
        assert body["risk_level"] in {"low", "medium", "high"}
        assert 0 <= body["risk_score"] <= 1
        assert "collect_request" in body["triggered_rules"]

    def test_clean_request_scores_low(self):
        r = client.post("/predict/upi-request", json={
            "payee_vpa": "friend@okhdfcbank",
            "is_collect_request": False,
            "payee_verified": True,
            "requested_amount": 500,
        })
        assert r.json()["risk_level"] == "low"


class TestChatEndpoint:
    def test_rejects_empty_message_list(self):
        r = client.post("/chat", json={"messages": []})
        assert r.status_code in (400, 500)

    def test_does_not_leak_internal_errors(self):
        """
        Regression guard: /chat used to return raw exception text to the client,
        which exposed the Gemini API key in an error message.
        """
        r = client.post("/chat", json={
            "messages": [{"role": "user", "content": "hello"}]
        })
        body = str(r.json())
        # Naming the env var is fine ("GEMINI_API_KEY is not configured").
        # Leaking its *value* or a stack trace is not.
        assert "AIza" not in body, "response leaked an API key value"
        assert "AQ.Ab8" not in body, "response leaked an API key value"
        assert "Traceback" not in body, "response leaked a stack trace"
        assert "File \"" not in body, "response leaked a file path"
