import os
import logging
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from pydantic import BaseModel, Field
from typing import Optional, List
from dotenv import load_dotenv
from google import genai
from google.genai import types

from app.ml.predict import predict_message, predict_transaction, predict_upi_request

load_dotenv()

app = FastAPI(
    title="ScamShield API",
    description="ML + rule-based scam & fraud detection for UPI/digital payments",
    version="1.0.0",
)

# In production, set ALLOWED_ORIGINS to your frontend's deployed URL
# (comma-separated for multiple), e.g. "https://scamshield.vercel.app"
# chrome-extension:// origins are always allowed separately (via allow_origin_regex)
# so the ScamShield browser extension can reach the API regardless of this setting.
_origins_env = os.environ.get("ALLOWED_ORIGINS", "*")
allow_origins = ["*"] if _origins_env == "*" else [o.strip() for o in _origins_env.split(",")]

# Rate limiting. This API is public and /chat calls a paid third-party service,
# so without limits anyone can run up the bill with a loop. CORS does not help:
# it is enforced by browsers, and curl ignores it entirely.
#
# Limits are per client IP and held in memory, which is correct for a single
# instance. Running more than one instance would need shared storage (Redis).
# Disabled in the test suite: the tests deliberately make many rapid requests
# to the same endpoint, which is exactly what the limiter exists to stop.
_limits_enabled = os.environ.get("RATE_LIMIT_ENABLED", "true").lower() != "false"
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["120/hour"],
    enabled=_limits_enabled,
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_origin_regex=r"chrome-extension://.*",
    allow_methods=["*"],
    allow_headers=["*"],
)

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.6-flash")
# google-genai replaces the end-of-life google-generativeai package. It speaks
# plain HTTPS rather than gRPC, which is what transport="rest" was working around:
# gRPC retried silently inside the container instead of surfacing errors.
_client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None

CHAT_SYSTEM_PROMPT = """You are the ScamShield Assistant, built into a UPI/digital-payment fraud
detection app. Help people understand scam patterns, phishing tactics, and how to protect
themselves - especially around UPI, digital payments, and India's digital-payment context.
Keep answers concise and practical.
You are not a substitute for running an actual check in the app - if someone describes a
specific message, transaction, or request they're worried about, suggest they run it through
the relevant tab (Message / Transaction / UPI request) instead of guessing at a verdict.
Don't claim specific internal model behavior you're not certain of; describe the general
approach (ML + rule-based scoring) rather than asserting exact internals."""


class MessageRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000)


class RecentPayeeTxn(BaseModel):
    amount: float = Field(..., gt=0)
    minutes_ago: float = Field(..., ge=0)


class TransactionRequest(BaseModel):
    hour: int = Field(..., ge=0, le=23)
    amount: float = Field(..., gt=0)
    is_new_payee: bool = False
    txns_last_hour: int = Field(0, ge=0)
    device_changed_recently: bool = False
    payee_risk_score: float = Field(0.1, ge=0, le=1)
    is_weekend: bool = False
    amount_to_avg_ratio: float = Field(1.0, ge=0)
    recent_failed_attempts: int = Field(0, ge=0)
    # Optional: recent transfers to the SAME payee, so the model can see
    # sequence-level patterns (e.g. salami slicing) that a single transaction
    # cannot reveal. The API stores nothing; the caller supplies what it knows.
    recent_payee_txns: Optional[List[RecentPayeeTxn]] = None
    time_since_last_txn_min: float = Field(180, ge=0)


class UpiRequestPayload(BaseModel):
    payee_vpa: str
    is_collect_request: bool = False
    requested_amount: Optional[float] = None
    payee_verified: bool = True
    note: Optional[str] = ""


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage]


@app.get("/")
def root():
    return {"status": "ok", "service": "ScamShield API"}


@app.post("/predict/message")
@limiter.limit("30/minute")
def predict_message_endpoint(request: Request, req: MessageRequest):
    try:
        return predict_message(req.text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/predict/transaction")
@limiter.limit("30/minute")
def predict_transaction_endpoint(request: Request, req: TransactionRequest):
    try:
        return predict_transaction(req.model_dump())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/predict/upi-request")
@limiter.limit("30/minute")
def predict_upi_request_endpoint(request: Request, req: UpiRequestPayload):
    try:
        return predict_upi_request(req.model_dump())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/chat")
@limiter.limit("10/minute;100/day")
def chat_endpoint(request: Request, req: ChatRequest):
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY is not configured on the server.")
    if not req.messages:
        raise HTTPException(status_code=400, detail="messages must not be empty")
    try:
        # Gemini expects "model" rather than "assistant" for the AI turn.
        contents = [
            types.Content(
                role="model" if m.role == "assistant" else "user",
                parts=[types.Part(text=m.content)],
            )
            for m in req.messages
        ]
        response = _client.models.generate_content(
            model=GEMINI_MODEL,
            contents=contents,
            config=types.GenerateContentConfig(system_instruction=CHAT_SYSTEM_PROMPT),
        )
        return {"reply": response.text}
    except HTTPException:
        raise
    except Exception:
        logging.exception("Gemini call failed")
        raise HTTPException(status_code=502, detail="Assistant temporarily unavailable")
