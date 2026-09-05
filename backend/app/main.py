import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, List
from dotenv import load_dotenv
import google.generativeai as genai

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

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_origin_regex=r"chrome-extension://.*",
    allow_methods=["*"],
    allow_headers=["*"],
)

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY, transport="rest")

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


class TransactionRequest(BaseModel):
    hour: int = Field(..., ge=0, le=23)
    amount: float = Field(..., gt=0)
    is_new_payee: bool = False
    txns_last_hour: int = Field(0, ge=0)
    device_changed_recently: bool = False
    payee_risk_score: float = Field(0.1, ge=0, le=1)
    time_since_last_txn_min: float = Field(180, ge=0)
    is_weekend: bool = False
    amount_to_avg_ratio: float = Field(1.0, ge=0)
    recent_failed_attempts: int = Field(0, ge=0)


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
def predict_message_endpoint(req: MessageRequest):
    try:
        return predict_message(req.text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/predict/transaction")
def predict_transaction_endpoint(req: TransactionRequest):
    try:
        return predict_transaction(req.dict())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/predict/upi-request")
def predict_upi_request_endpoint(req: UpiRequestPayload):
    try:
        return predict_upi_request(req.dict())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/chat")
def chat_endpoint(req: ChatRequest):
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY is not configured on the server.")
    if not req.messages:
        raise HTTPException(status_code=400, detail="messages must not be empty")
    try:
        model = genai.GenerativeModel(
            model_name="gemini-3.6-flash",
            system_instruction=CHAT_SYSTEM_PROMPT,
        )
        # Gemini's chat history format expects "model" instead of "assistant" for the AI turn.
        history = []
        for m in req.messages[:-1]:
            gemini_role = "model" if m.role == "assistant" else "user"
            history.append({"role": gemini_role, "parts": [m.content]})

        chat = model.start_chat(history=history)
        response = chat.send_message(req.messages[-1].content)
        return {"reply": response.text}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail="Assistant temporarily unavailable")

import os, logging
_k = os.getenv("GEMINI_API_KEY", "")
logging.warning(f"GEMINI KEY CHECK: length={len(_k)} tail={_k[-4:] if _k else 'MISSING'}")
