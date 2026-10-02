"""
UPI QR code checks.

The single most important fact about a UPI QR code: scanning one and entering
your PIN always SENDS money. It never receives it. The commonest QR scam
(fake OLX/Facebook buyers, "scan to get your refund/cashback/prize") depends
entirely on the victim not knowing this. So the strongest signal here is not in
the QR at all - it is what the person was told the QR is for.

The QR's own contents add further signals: who the money really goes to, a
pre-filled amount, bait words in the payee name, an autopay mandate hidden in
what looks like a payment, or a QR that is not a payment at all but a link.

Formats handled:
  - UPI deep links: upi://pay?pa=<vpa>&pn=<name>&am=<amount>&tn=<note>&cu=INR
    (and upi://mandate?... for autopay)
  - EMVCo / Bharat QR merchant codes (start with "000201"), best-effort
  - Anything else: a URL, or plain text
"""

import re
from urllib.parse import parse_qs, urlsplit

from .rules import CREDENTIAL_REQUEST_PHRASES, SUSPICIOUS_URL_PATTERNS, URGENCY_PHRASES

VPA_RE = re.compile(r"^[a-z0-9._-]{2,256}@[a-z][a-z0-9.-]{1,64}$")
PHONE_HANDLE_RE = re.compile(r"^(?:\+?91)?[6-9]\d{9}$")

BAIT_WORDS = [
    "refund", "cashback", "reward", "prize", "lottery", "winner", "lucky",
    "kyc", "support", "helpdesk", "customer care", "customercare", "gift",
]
AUTHORITY_WORDS = [
    "bank", "rbi", "reserve bank", "sbi", "hdfc", "icici", "income tax",
    "police", "customs", "cyber cell", "electricity", "government", "govt",
    "npci", "paytm", "phonepe", "google pay",
]
# Words in a QR note that promise the SCANNER money - impossible for a pay QR.
RECEIVE_PROMISES = [
    "receive", "get your", "claim", "cashback", "refund", "prize", "reward",
    "milega", "paise milenge", "wapas",
]

LINK_RE = re.compile(r"^(?:https?://|www\.)", re.I)


def _first(params: dict, key: str) -> str:
    vals = params.get(key) or params.get(key.upper()) or []
    return vals[0].strip() if vals else ""


def _parse_amount(value: str):
    try:
        amt = float(value)
    except (TypeError, ValueError):
        return None
    return amt if amt > 0 else None


def _tlv(raw: str) -> dict:
    """EMVCo TLV: 2-digit tag, 2-digit length, value. Stops at malformed data."""
    fields, i = {}, 0
    while i + 4 <= len(raw):
        tag, length = raw[i:i + 2], raw[i + 2:i + 4]
        if not length.isdigit() or i + 4 + int(length) > len(raw):
            break
        fields[tag] = raw[i + 4:i + 4 + int(length)]
        i += 4 + int(length)
    return fields


def _parse_emv(raw: str) -> dict:
    fields = _tlv(raw)
    vpa = ""
    # Tags 26-51 hold merchant account info, itself nested TLV; the UPI ID is
    # one of the sub-values. Match whole sub-values only, so digits from a
    # neighbouring sub-field can never be glued onto the UPI ID.
    for tag in (f"{t:02d}" for t in range(26, 52)):
        for sub in _tlv(fields.get(tag, "")).values():
            if VPA_RE.match(sub.lower()):
                vpa = sub.lower()
                break
        if vpa:
            break
    return {
        "kind": "upi_merchant",
        "payee_vpa": vpa,
        "payee_name": fields.get("59", "").strip(),
        "amount": _parse_amount(fields.get("54")),
        "note": "",
        "currency": "INR" if fields.get("53", "356") == "356" else fields.get("53", ""),
        "is_mandate": False,
    }


def parse_upi_qr(raw: str) -> dict:
    """Turn decoded QR text into structured fields. Never raises."""
    text = (raw or "").strip()
    empty = {"payee_vpa": "", "payee_name": "", "amount": None, "note": "",
             "currency": "", "is_mandate": False}

    if text.lower().startswith("upi://"):
        parts = urlsplit(text)
        params = {k.lower(): v for k, v in parse_qs(parts.query, keep_blank_values=True).items()}
        return {
            "kind": "upi",
            "payee_vpa": _first(params, "pa").lower(),
            "payee_name": _first(params, "pn"),
            "amount": _parse_amount(_first(params, "am")),
            "note": _first(params, "tn"),
            "currency": _first(params, "cu").upper() or "INR",
            "is_mandate": parts.netloc.lower() == "mandate",
        }
    if text.startswith("000201"):
        try:
            return _parse_emv(text)
        except Exception:
            return {"kind": "upi_merchant", **empty}
    if LINK_RE.match(text):
        return {"kind": "link", **empty, "url": text}
    return {"kind": "text", **empty, "text": text[:200]}


def score_upi_qr(parsed: dict, expecting_to_receive: bool = False) -> dict:
    flags, boost = [], 0.0

    def flag(name, weight):
        nonlocal boost
        flags.append(name)
        boost += weight

    if expecting_to_receive:
        # On its own this is enough for "high": there is no legitimate way to
        # receive money by scanning a QR and entering your PIN.
        flag("scan_to_receive_trick", 0.75)

    kind = parsed.get("kind")
    if kind == "link":
        flag("qr_opens_a_link", 0.2)
        if any(re.search(p, parsed.get("url", "").lower()) for p in SUSPICIOUS_URL_PATTERNS):
            flag("suspicious_url", 0.3)
    elif kind in ("upi", "upi_merchant"):
        vpa = parsed.get("payee_vpa", "")
        name = parsed.get("payee_name", "").lower()
        note = parsed.get("note", "").lower()
        amount = parsed.get("amount")

        if not VPA_RE.match(vpa):
            flag("malformed_payment_qr", 0.35)
        if parsed.get("is_mandate"):
            flag("autopay_mandate", 0.35)
        if any(w in vpa or w in name for w in BAIT_WORDS):
            flag("suspicious_payee_name", 0.25)
        local_part = vpa.split("@")[0]
        if PHONE_HANDLE_RE.match(local_part) and any(w in name for w in AUTHORITY_WORDS):
            flag("authority_name_on_personal_upi", 0.3)
        if note and any(p in note for p in RECEIVE_PROMISES):
            flag("note_promises_you_money", 0.4)
        elif note and any(p in note for p in URGENCY_PHRASES + CREDENTIAL_REQUEST_PHRASES):
            flag("suspicious_note_text", 0.15)
        if amount is not None and 0 < amount <= 10:
            flag("token_amount_trick", 0.2)
        if parsed.get("currency") and parsed["currency"] != "INR":
            flag("non_inr_currency", 0.15)

    return {"triggered_rules": flags, "rule_boost": min(0.95, boost)}


_LABELS = {
    "scan_to_receive_trick": "you were told this QR would let you receive money, but scanning a QR and entering your PIN only ever sends money",
    "qr_opens_a_link": "this QR opens a website rather than a payment",
    "suspicious_url": "the link looks like a known phishing pattern",
    "malformed_payment_qr": "the payment QR does not contain a valid UPI ID",
    "autopay_mandate": "this QR sets up an autopay mandate that can take money repeatedly, not a one-time payment",
    "suspicious_payee_name": "the payee name or UPI ID uses refund/cashback/prize-style bait",
    "authority_name_on_personal_upi": "a bank or government name is attached to a personal phone-number UPI ID",
    "note_promises_you_money": "the payment note promises you money, which a payment QR cannot do",
    "suspicious_note_text": "the payment note uses pressure or asks for codes",
    "token_amount_trick": "a tiny pre-filled amount is a common 'verification' trick",
    "non_inr_currency": "the payment is not in rupees",
}


def explain_upi_qr(triggered_rules, parsed) -> str:
    reasons = [_LABELS[r] for r in triggered_rules if r in _LABELS]
    if reasons:
        return "Flagged because " + "; ".join(reasons) + "."
    if parsed.get("kind") == "text":
        return "This QR contains plain text, not a payment or a link."
    who = parsed.get("payee_name") or parsed.get("payee_vpa") or "the payee"
    return (f"No known scam patterns. Paying this QR sends money to {who} - "
            "check that name matches who you meant to pay before entering your PIN.")
