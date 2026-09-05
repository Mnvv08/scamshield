"""
Rule engine layer.

Real fraud-detection systems are hybrid: ML catches statistical patterns,
but well-known, unambiguous scam signals (spoofed sender IDs, known-bad
domain patterns, request-vs-push confusion) are better handled with explicit
rules - they're more explainable, more auditable, and can be updated instantly
without retraining a model when a new scam pattern starts trending.
"""

import re

SUSPICIOUS_URL_PATTERNS = [
    r"bit\.ly", r"tinyurl", r"\.tk\b", r"\.xyz\b", r"\.top\b",
    r"kyc-?verify", r"-verify\d*\.", r"secure-?update",
]

URGENCY_PHRASES = [
    "urgent", "immediately", "will be blocked", "will be suspended",
    "act now", "verify now", "expires today", "final notice",
    "legal action", "account will be closed",
    # "will expire" catches the very common "your KYC will expire today" phrasing
    # that "expires today" misses - substring matching is literal.
    "will expire", "expiring soon", "last chance", "within 24 hours",
    "avoid suspension", "update your kyc", "kyc will expire",
]

CREDENTIAL_REQUEST_PHRASES = [
    "upi pin", "otp", "cvv", "card number", "share the code",
    "install anydesk", "install teamviewer", "screen share",
]

AUTHORITY_IMPERSONATION_PHRASES = [
    "rbi officer", "income tax", "customs", "police case",
    "money laundering", "bank official", "customer care agent",
]


def score_message_rules(text: str) -> dict:
    text_l = text.lower()
    hits = {
        "suspicious_url": any(re.search(p, text_l) for p in SUSPICIOUS_URL_PATTERNS),
        "urgency_language": any(p in text_l for p in URGENCY_PHRASES),
        "credential_request": any(p in text_l for p in CREDENTIAL_REQUEST_PHRASES),
        "authority_impersonation": any(p in text_l for p in AUTHORITY_IMPERSONATION_PHRASES),
    }
    triggered = [k for k, v in hits.items() if v]
    # each triggered rule nudges the risk score; capped at 0.4 so ML still dominates
    rule_boost = min(0.4, 0.12 * len(triggered))
    return {"triggered_rules": triggered, "rule_boost": rule_boost}


def score_upi_request_rules(payload: dict) -> dict:
    """
    payload keys: payee_vpa (str), is_collect_request (bool),
                  requested_amount (float), payee_verified (bool), note (str)
    """
    flags = []
    boost = 0.0

    if payload.get("is_collect_request"):
        flags.append("collect_request")  # scammers almost always use collect, not push
        boost += 0.25

    if not payload.get("payee_verified", True):
        flags.append("unverified_payee")
        boost += 0.2

    vpa = str(payload.get("payee_vpa", "")).lower()
    if any(k in vpa for k in ["refund", "cashback", "reward", "prize", "support", "kyc"]):
        flags.append("suspicious_vpa_naming")
        boost += 0.2

    note = str(payload.get("note", "")).lower()
    if any(p in note for p in URGENCY_PHRASES + CREDENTIAL_REQUEST_PHRASES):
        flags.append("suspicious_note_text")
        boost += 0.15

    amt = payload.get("requested_amount", 0) or 0
    if 0 < amt <= 10:
        # classic "collect Re 1 to verify/claim reward" trick
        flags.append("token_amount_trick")
        boost += 0.2

    return {"triggered_rules": flags, "rule_boost": min(0.9, boost)}
