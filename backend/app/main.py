import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional
from dotenv import load_dotenv
import google.generativeai as genai

from app.ml.predict import predict_message, predict_transaction, predict_upi_request

load_dotenv()

app = FastAPI(
    title="ScamShield API",
    description="ML + rule-based scam & fraud detection for UPI/digital payments",
    version="1.0.0",
)

_origins_env = os.environ.get("ALLOWED_ORIGINS", "*")
allow_origins = ["*"] if _origins_env == "*" else [o.strip() for o in _origins_env.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

CHAT_SYSTEM_PROMPT = """You are the ScamShield Assistant, built into a UPI fraud detection tool.
You help users understand digital payment scams, red flags in messages and UPI requests,
and how to stay safe. Keep answers short (2-4 sentences unless asked for more detail),
practical, and specific to Indian UPI/digital payment fraud patterns
(fake KYC links, collect requests, OTP scams, refund scams, fake customer care numbers, etc).
If asked something unrelated to fraud or payment safety, briefly redirect to what you can help with.
Never ask the user for or process a real OTP, PIN, password, or account number."""

gemini_model = genai.GenerativeModel(
    model_name="gemini-3.6-flash",
    system_instruction=CHAT_SYSTEM_PROMPT,
) if GEMINI_API_KEY else None


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
    messages: list[ChatMessage]


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
    if not gemini_model:
        raise HTTPException(
            status_code=500,
            detail="Chat is not configured on the server (missing GEMINI_API_KEY).",
        )
    try:
        history = []
        for m in req.messages[:-1]:
            role = "user" if m.role == "user" else "model"
            history.append({"role": role, "parts": [m.content]})

        chat = gemini_model.start_chat(history=history)
        response = chat.send_message(req.messages[-1].content)
        return {"reply": response.text}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Gemini API error: {str(e)}")