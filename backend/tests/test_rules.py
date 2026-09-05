"""
Tests for the rule engine.

These deliberately require no trained model files: the rule engine is the
part of the system that must stay predictable and auditable, so it should
be testable on its own. Each test names the real scam pattern it guards
against, so a failure tells you which detection broke.
"""

import pytest

from app.ml.rules import score_message_rules, score_upi_request_rules


# --------------------------------------------------------------------------
# Message rules
# --------------------------------------------------------------------------

class TestSuspiciousUrl:
    @pytest.mark.parametrize("text", [
        "Click http://bit.ly/kyc-verify now",
        "Visit tinyurl.com/abc123",
        "Go to secure-update.example.com",
        "Login at http://sbi-verify1.tk",
    ])
    def test_flags_known_bad_url_shapes(self, text):
        assert "suspicious_url" in score_message_rules(text)["triggered_rules"]

    @pytest.mark.parametrize("text", [
        "See https://www.sbi.co.in for details",
        "Read more at https://github.com/Mnvv08/scamshield",
    ])
    def test_ignores_legitimate_urls(self, text):
        assert "suspicious_url" not in score_message_rules(text)["triggered_rules"]


class TestUrgencyLanguage:
    @pytest.mark.parametrize("text", [
        "Your KYC will expire today",          # regression: was missed before f6c569f
        "Your account will be blocked",
        "URGENT: verify now",
        "Final notice before legal action",
        "Complete within 24 hours to avoid suspension",
    ])
    def test_flags_pressure_tactics(self, text):
        assert "urgency_language" in score_message_rules(text)["triggered_rules"]

    def test_ignores_ordinary_message(self):
        result = score_message_rules("Hey, are we still on for lunch at 1?")
        assert result["triggered_rules"] == []
        assert result["rule_boost"] == 0.0


class TestCredentialRequest:
    @pytest.mark.parametrize("text", [
        "Share your UPI PIN to confirm",
        "Please tell me the OTP you received",
        "Install AnyDesk so I can help you",
    ])
    def test_flags_credential_harvesting(self, text):
        assert "credential_request" in score_message_rules(text)["triggered_rules"]


class TestAuthorityImpersonation:
    @pytest.mark.parametrize("text", [
        "I am an RBI officer calling about your account",
        "This is regarding a police case against you",
        "Income tax department notice",
    ])
    def test_flags_impersonation(self, text):
        assert "authority_impersonation" in score_message_rules(text)["triggered_rules"]


class TestMessageScoring:
    def test_case_insensitive(self):
        lower = score_message_rules("urgent: share your otp")
        upper = score_message_rules("URGENT: SHARE YOUR OTP")
        assert lower["triggered_rules"] == upper["triggered_rules"]

    def test_boost_scales_with_rule_count(self):
        one = score_message_rules("This is urgent")
        two = score_message_rules("This is urgent, click http://bit.ly/x")
        assert two["rule_boost"] > one["rule_boost"]

    def test_boost_is_capped_so_ml_still_dominates(self):
        """All four rules firing must not exceed the 0.4 cap."""
        text = ("URGENT: RBI officer here. Your account will be blocked. "
                "Share your UPI PIN at http://bit.ly/kyc-verify")
        result = score_message_rules(text)
        assert len(result["triggered_rules"]) == 4
        assert result["rule_boost"] == pytest.approx(0.4)

    def test_empty_string_is_safe(self):
        result = score_message_rules("")
        assert result["triggered_rules"] == []


# --------------------------------------------------------------------------
# UPI collect-request rules
# --------------------------------------------------------------------------

class TestUpiRequestRules:
    def test_collect_request_is_flagged(self):
        """The core UPI scam: you approve a REQUEST thinking you'll receive money."""
        result = score_upi_request_rules({
            "payee_vpa": "someone@upi", "is_collect_request": True,
        })
        assert "collect_request" in result["triggered_rules"]

    def test_push_payment_to_verified_payee_is_clean(self):
        result = score_upi_request_rules({
            "payee_vpa": "friend@okhdfcbank",
            "is_collect_request": False,
            "payee_verified": True,
            "requested_amount": 500,
            "note": "dinner",
        })
        assert result["triggered_rules"] == []
        assert result["rule_boost"] == 0.0

    @pytest.mark.parametrize("vpa", [
        "refund-dept@upi", "cashback2024@ybl", "kyc-support@paytm", "prize@upi",
    ])
    def test_flags_bait_words_in_payee_id(self, vpa):
        result = score_upi_request_rules({"payee_vpa": vpa})
        assert "suspicious_vpa_naming" in result["triggered_rules"]

    def test_token_amount_trick(self):
        """'Send Re 1 to claim your reward' - small amount to establish trust."""
        result = score_upi_request_rules({
            "payee_vpa": "x@upi", "requested_amount": 1,
        })
        assert "token_amount_trick" in result["triggered_rules"]

    def test_normal_amount_is_not_a_token_trick(self):
        result = score_upi_request_rules({
            "payee_vpa": "x@upi", "requested_amount": 500,
        })
        assert "token_amount_trick" not in result["triggered_rules"]

    def test_worst_case_is_capped(self):
        result = score_upi_request_rules({
            "payee_vpa": "refund@upi",
            "is_collect_request": True,
            "payee_verified": False,
            "requested_amount": 1,
            "note": "urgent, share otp",
        })
        assert result["rule_boost"] <= 0.9

    def test_missing_keys_do_not_crash(self):
        """Defensive: the API may send partial payloads."""
        assert score_upi_request_rules({})["triggered_rules"] == []
