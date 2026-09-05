import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional

from app.ml.predict import predict_message, predict_transaction, predict_upi_request

app = FastAPI(
    title="ScamShield API",
    description="ML + rule-based scam & fraud detection for UPI/digital payments",
    version="1.0.0",
)

# In production, set ALLOWED_ORIGINS to your frontend's deployed URL
# (comma-separated for multiple), e.g. "https://scamshield.vercel.app"
_origins_env = os.environ.get("ALLOWED_ORIGINS", "*")
allow_origins = ["*"] if _origins_env == "*" else [o.strip() for o in _origins_env.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
