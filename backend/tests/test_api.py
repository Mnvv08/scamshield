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


class TestPayeeHistory:
    """
    Sequence features: the API is stateless, so callers pass recent transfers to
    the same payee. Without them the model can only see one transaction, which
    makes salami slicing invisible (see app/ml/test_generalization.py).
    """

    def test_history_is_optional(self):
        r = client.post("/predict/transaction", json={"hour": 14, "amount": 500})
        assert r.status_code == 200

    def test_rejects_malformed_history(self):
        r = client.post("/predict/transaction", json={
            "hour": 14, "amount": 500,
            "recent_payee_txns": [{"amount": -5, "minutes_ago": 10}],
        })
        assert r.status_code == 422

    def test_repeated_small_transfers_raise_risk(self):
        """Salami slicing: each transfer is ordinary, the pattern is not."""
        body = {"hour": 14, "amount": 180, "is_new_payee": False}
        alone = client.post("/predict/transaction", json=body).json()
        with_history = client.post("/predict/transaction", json={
            **body,
            "recent_payee_txns": [{"amount": 180, "minutes_ago": i * 20} for i in range(1, 31)],
        }).json()
        assert with_history["risk_score"] > alone["risk_score"]
        assert "transfers to this payee" in with_history["explanation"]

    def test_ignores_transactions_older_than_24h(self):
        recent = [{"amount": 180, "minutes_ago": i * 20} for i in range(1, 31)]
        stale = [{"amount": 180, "minutes_ago": 1441 + i} for i in range(1, 31)]
        body = {"hour": 14, "amount": 180, "is_new_payee": False}
        r_recent = client.post("/predict/transaction", json={**body, "recent_payee_txns": recent}).json()
        r_stale = client.post("/predict/transaction", json={**body, "recent_payee_txns": stale}).json()
        assert r_stale["risk_score"] < r_recent["risk_score"]

    def test_amount_spike_versus_payee_average(self):
        r = client.post("/predict/transaction", json={
            "hour": 14, "amount": 40000, "is_new_payee": False,
            "recent_payee_txns": [{"amount": 200, "minutes_ago": i * 100} for i in range(1, 5)],
        }).json()
        assert "far larger than usual" in r["explanation"]


class TestRateLimiting:
    """
    The API is public and /chat calls a paid service, so it is rate limited per
    IP. Limits are disabled for the rest of the suite (see conftest.py); this
    test re-enables them on its own app instance.
    """

    def test_limit_returns_429_after_threshold(self, monkeypatch):
        import importlib
        import os

        monkeypatch.setenv("RATE_LIMIT_ENABLED", "true")
        import app.main as main
        importlib.reload(main)
        c = TestClient(main.app)

        codes = [
            c.post("/predict/message", json={"text": "a test message"}).status_code
            for _ in range(35)
        ]
        assert 200 in codes, "healthy requests should still succeed"
        assert 429 in codes, "limiter should reject once the threshold is passed"
        assert codes.index(429) > 25, "limit should not fire too early"

        # restore the shared module for any later tests
        monkeypatch.setenv("RATE_LIMIT_ENABLED", "false")
        importlib.reload(main)


class TestPayeeHistoryEdgeCases:
    """
    Edge cases found by probing the endpoint directly, not by inspection:
    the 24h cutoff is inclusive at exactly 1440 minutes, an unbounded
    history array was accepted with no size limit, and amount had no
    upper sanity ceiling. All three are exercised here.
    """

    def test_omitted_and_empty_history_behave_identically(self):
        base = {"hour": 14, "amount": 500, "is_new_payee": False}
        r1 = client.post("/predict/transaction", json=base).json()
        r2 = client.post("/predict/transaction", json={**base, "recent_payee_txns": []}).json()
        assert r1["risk_score"] == r2["risk_score"]

    def test_24h_cutoff_is_inclusive_at_exactly_1440_minutes(self):
        base = {"hour": 14, "amount": 500, "is_new_payee": False}
        at_boundary = client.post("/predict/transaction", json={
            **base, "recent_payee_txns": [{"amount": 180, "minutes_ago": 1440}],
        }).json()
        just_after = client.post("/predict/transaction", json={
            **base, "recent_payee_txns": [{"amount": 180, "minutes_ago": 1441}],
        }).json()
        # This locks in current behaviour (1440 counts, 1441 doesn't) so a
        # future change to the cutoff is a deliberate decision, not a silent
        # off-by-one.
        assert at_boundary["risk_score"] != just_after["risk_score"]

    def test_rejects_negative_minutes_ago(self):
        r = client.post("/predict/transaction", json={
            "hour": 14, "amount": 500,
            "recent_payee_txns": [{"amount": 180, "minutes_ago": -5}],
        })
        assert r.status_code == 422

    def test_rejects_zero_amount_in_history_item(self):
        r = client.post("/predict/transaction", json={
            "hour": 14, "amount": 500,
            "recent_payee_txns": [{"amount": 0, "minutes_ago": 10}],
        })
        assert r.status_code == 422

    def test_rejects_history_item_missing_amount(self):
        r = client.post("/predict/transaction", json={
            "hour": 14, "amount": 500,
            "recent_payee_txns": [{"minutes_ago": 10}],
        })
        assert r.status_code == 422

    def test_history_array_has_a_size_cap(self):
        """
        Without a cap, a caller can force the server to do unbounded work
        on every request just by sending a longer array. 101 items should
        be rejected; 100 should not.
        """
        oversized = [{"amount": 100, "minutes_ago": 10} for _ in range(101)]
        at_limit = [{"amount": 100, "minutes_ago": 10} for _ in range(100)]
        base = {"hour": 14, "amount": 500, "is_new_payee": False}

        r_over = client.post("/predict/transaction", json={**base, "recent_payee_txns": oversized})
        r_at = client.post("/predict/transaction", json={**base, "recent_payee_txns": at_limit})
        assert r_over.status_code == 422
        assert r_at.status_code != 422

    def test_amount_has_a_sanity_ceiling(self):
        r_huge = client.post("/predict/transaction", json={
            "hour": 14, "amount": 1e15, "is_new_payee": False,
        })
        r_reasonable = client.post("/predict/transaction", json={
            "hour": 14, "amount": 50000, "is_new_payee": False,
        })
        assert r_huge.status_code == 422
        assert r_reasonable.status_code != 422
