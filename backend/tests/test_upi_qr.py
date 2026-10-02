"""UPI QR parsing and scoring."""
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.ml.upi_qr import parse_upi_qr, score_upi_qr

client = TestClient(app)


def tlv(tag, val):
    return f"{tag}{len(val):02d}{val}"


def bharat_qr(vpa="chaipoint@okaxis", name="Chai Point BLR", amount="40.00"):
    account = tlv("00", "A000000677010111") + tlv("01", vpa)
    return (tlv("00", "01") + tlv("26", account) + tlv("53", "356")
            + tlv("54", amount) + tlv("59", name) + tlv("63", "ABCD"))


class TestParsing:
    def test_parses_upi_link(self):
        p = parse_upi_qr("upi://pay?pa=Shop@okicici&pn=Sharma%20Store&am=250&tn=groceries&cu=INR")
        assert p["kind"] == "upi"
        assert p["payee_vpa"] == "shop@okicici"
        assert p["payee_name"] == "Sharma Store"
        assert p["amount"] == 250.0
        assert p["note"] == "groceries"

    def test_parameter_names_are_case_insensitive(self):
        p = parse_upi_qr("UPI://PAY?PA=shop@okicici&PN=Store")
        assert p["payee_vpa"] == "shop@okicici"

    def test_detects_mandate(self):
        assert parse_upi_qr("upi://mandate?pa=subs@okaxis&am=999")["is_mandate"]

    def test_parses_bharat_qr_nested_fields(self):
        p = parse_upi_qr(bharat_qr())
        assert p["kind"] == "upi_merchant"
        assert p["payee_vpa"] == "chaipoint@okaxis"  # not glued to the GUID sub-field
        assert p["payee_name"] == "Chai Point BLR"
        assert p["amount"] == 40.0

    @pytest.mark.parametrize("raw,kind", [
        ("https://example.com/pay", "link"),
        ("www.example.com", "link"),
        ("just some text", "text"),
        ("", "text"),
        ("000201garbage", "upi_merchant"),
    ])
    def test_classifies_non_upi_content_without_crashing(self, raw, kind):
        assert parse_upi_qr(raw)["kind"] == kind


class TestScoring:
    def score(self, raw, receive=False):
        return score_upi_qr(parse_upi_qr(raw), receive)

    def test_ordinary_shop_qr_is_clean(self):
        assert self.score("upi://pay?pa=sharmastore@okicici&pn=Sharma%20Store")["triggered_rules"] == []

    def test_scan_to_receive_is_high_on_its_own(self):
        """The OLX-buyer scam: a normal-looking QR, but 'scan this to get paid'."""
        result = self.score("upi://pay?pa=9876543210@ybl&pn=Rahul&am=5000", receive=True)
        assert "scan_to_receive_trick" in result["triggered_rules"]
        assert result["rule_boost"] >= 0.7

    def test_flags_bait_payee_name(self):
        assert "suspicious_payee_name" in self.score(
            "upi://pay?pa=amazon.refund@upi&pn=Amazon%20Refund")["triggered_rules"]

    def test_flags_bank_name_on_phone_number_upi(self):
        assert "authority_name_on_personal_upi" in self.score(
            "upi://pay?pa=9123456780@paytm&pn=SBI%20Department")["triggered_rules"]

    def test_bank_name_on_business_upi_is_not_flagged(self):
        assert "authority_name_on_personal_upi" not in self.score(
            "upi://pay?pa=bescom.bills@sbi&pn=BESCOM%20Electricity")["triggered_rules"]

    def test_flags_note_promising_money(self):
        assert "note_promises_you_money" in self.score(
            "upi://pay?pa=x@upi&tn=scan%20to%20receive%20your%20cashback")["triggered_rules"]

    def test_flags_autopay_mandate(self):
        assert "autopay_mandate" in self.score("upi://mandate?pa=subs@okaxis&am=999")["triggered_rules"]

    def test_flags_token_amount(self):
        assert "token_amount_trick" in self.score("upi://pay?pa=x@upi&am=1")["triggered_rules"]

    def test_flags_missing_upi_id(self):
        assert "malformed_payment_qr" in self.score("upi://pay?pn=Someone")["triggered_rules"]

    def test_flags_phishing_link_qr(self):
        rules = self.score("http://bit.ly/kyc-verify")["triggered_rules"]
        assert {"qr_opens_a_link", "suspicious_url"} <= set(rules)

    def test_worst_case_is_capped(self):
        result = self.score("upi://mandate?pa=9123456780@upi&pn=SBI%20Refund&am=1&tn=claim%20prize&cu=USD",
                            receive=True)
        assert result["rule_boost"] <= 0.95


class TestEndpoint:
    def test_requires_raw(self):
        assert client.post("/predict/upi-qr", json={}).status_code == 422

    def test_rejects_overlong_input(self):
        assert client.post("/predict/upi-qr", json={"raw": "x" * 2001}).status_code == 422

    def test_returns_scored_response_with_decoded_fields(self):
        r = client.post("/predict/upi-qr", json={
            "raw": "upi://pay?pa=9876543210@ybl&pn=Rahul&am=5000", "expecting_to_receive": True})
        assert r.status_code == 200
        body = r.json()
        assert body["risk_level"] == "high"
        assert body["qr"]["payee_vpa"] == "9876543210@ybl"
        assert body["qr"]["amount"] == 5000.0
        assert "only ever sends money" in body["explanation"]
