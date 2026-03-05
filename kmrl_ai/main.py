"""
KMRL AI Scheduling Engine
=========================
FastAPI backend that:
  1. Reads train fleet data (CSV / Firestore-compatible JSON)
  2. Scores and ranks trains by fitness, mileage, maintenance history, and ML-predicted delay risk
  3. Builds an AI-prioritised schedule (unfit trains → lowest priority)
  4. Learns from historical delay logs via a Gradient Boosted model
  5. Exposes clean REST endpoints consumed by the Next.js front-end
"""

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import pandas as pd
import numpy as np
import joblib
import os
import json
from datetime import date, datetime
from pathlib import Path

from scheduler import KMRLScheduler
from ml_engine import DelayPredictor

# ── Paths ──────────────────────────────────────────────────────────────────────
BASE = Path(__file__).parent
DATA_DIR = BASE / "data"
MODEL_DIR = BASE / "models"
LOGS_DIR  = BASE / "logs"
for d in [DATA_DIR, MODEL_DIR, LOGS_DIR]:
    d.mkdir(exist_ok=True)

# ── Boot ───────────────────────────────────────────────────────────────────────
scheduler  = KMRLScheduler(DATA_DIR)
predictor  = DelayPredictor(DATA_DIR, MODEL_DIR)

# Train or load model at startup
if not (MODEL_DIR / "delay_model.joblib").exists():
    predictor.train()
else:
    predictor.load()

app = FastAPI(
    title="KMRL AI Scheduling API",
    description="AI-driven train scheduling with delay prediction and fleet prioritisation",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Request / Response models ──────────────────────────────────────────────────
class DelayLogEntry(BaseModel):
    train_id: str
    scheduled_dep_min: int
    actual_dep_min: int
    route: str = "Full"
    direction: str = "Northbound"
    demand_level: str = "medium"
    had_maintenance: int = 0
    weather_code: int = 0
    incident_flag: int = 0

class ScheduleRequest(BaseModel):
    date: Optional[str] = None        # "YYYY-MM-DD", defaults to today
    num_slots: Optional[int] = 20     # how many departure slots to fill

# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"service": "KMRL AI Scheduling Engine", "status": "running", "version": "2.0.0"}


@app.get("/fleet")
def get_fleet(target_date: Optional[str] = None):
    """
    Returns all 30 trains ranked by AI priority score.
    Unfit trains are flagged and placed at lowest priority.
    """
    target = target_date or str(date.today())
    fleet = scheduler.build_ranked_fleet(target, predictor)
    return {"date": target, "fleet": fleet}


@app.get("/schedule")
def get_schedule(target_date: Optional[str] = None, num_slots: int = 25):
    """
    Returns an AI-optimised departure schedule.
    High-priority (fit, low-risk) trains fill early slots.
    Unfit trains are pinned to the lowest-priority slots.
    """
    target = target_date or str(date.today())
    schedule = scheduler.build_ai_schedule(target, predictor, num_slots)
    return {"date": target, "schedule": schedule}


@app.get("/schedule/{train_id}")
def get_train_schedule(train_id: str, target_date: Optional[str] = None):
    """Single train's trips for the day with AI annotations."""
    target = target_date or str(date.today())
    fleet = scheduler.build_ranked_fleet(target, predictor)
    train = next((t for t in fleet if t["train_id"] == train_id), None)
    if not train:
        raise HTTPException(404, f"{train_id} not found")
    trips = scheduler.build_trips_for_train(train_id, target, predictor)
    return {"train": train, "trips": trips}


@app.get("/predict/delay/{train_id}")
def predict_delay(train_id: str, dep_min: int = 360, direction: str = "Northbound",
                  demand_level: str = "medium", target_date: Optional[str] = None):
    """Predict delay risk (minutes) for a specific train + departure."""
    target = target_date or str(date.today())
    result = predictor.predict_single(train_id, dep_min, direction, demand_level, target, scheduler)
    return result


@app.post("/log/delay")
def log_delay(entry: DelayLogEntry, background_tasks: BackgroundTasks):
    """
    Record an actual delay event.
    The model will be retrained in the background after 10 new entries.
    """
    delay_min = entry.actual_dep_min - entry.scheduled_dep_min
    log_path = LOGS_DIR / "delay_events.csv"
    row = {
        "date": str(date.today()),
        "train_id": entry.train_id,
        "scheduled_dep_min": entry.scheduled_dep_min,
        "actual_dep_min": entry.actual_dep_min,
        "delay_min": delay_min,
        "route": entry.route,
        "direction": entry.direction,
        "demand_level": entry.demand_level,
        "day_of_week": datetime.today().weekday(),
        "hour_of_day": entry.scheduled_dep_min // 60,
        "had_maintenance": entry.had_maintenance,
        "cert_days_remaining": _get_cert_days(entry.train_id),
        "mileage_km": _get_mileage(entry.train_id),
        "weather_code": entry.weather_code,
        "incident_flag": entry.incident_flag,
    }
    df_new = pd.DataFrame([row])
    if log_path.exists():
        df_new.to_csv(log_path, mode="a", header=False, index=False)
    else:
        df_new.to_csv(log_path, index=False)

    # Retrain if we have accumulated enough new data
    n_new = sum(1 for _ in open(log_path)) - 1
    if n_new % 10 == 0:
        background_tasks.add_task(_retrain)

    return {"status": "logged", "delay_min": delay_min, "new_entries": n_new}


@app.post("/model/retrain")
def retrain_model():
    """Manually trigger model retraining on all available data."""
    metrics = predictor.train()
    return {"status": "retrained", "metrics": metrics}


@app.get("/model/info")
def model_info():
    """Returns current model performance metrics."""
    return predictor.get_info()


@app.get("/analytics/delay-risk")
def delay_risk_summary(target_date: Optional[str] = None):
    """Summary of predicted delay risk across the full fleet for a given day."""
    target = target_date or str(date.today())
    fleet = scheduler.build_ranked_fleet(target, predictor)
    summary = [
        {
            "train_id": t["train_id"],
            "is_fit": t["is_fit"],
            "priority_score": t["priority_score"],
            "predicted_delay_min": t.get("predicted_delay_min", 0),
            "risk_level": t.get("risk_level", "low"),
        }
        for t in fleet
    ]
    return {"date": target, "risk_summary": summary}


# ── Internal helpers ───────────────────────────────────────────────────────────
def _get_cert_days(train_id: str) -> int:
    try:
        df = pd.read_csv(DATA_DIR / "kmrl_trains_bulk_upload.csv")
        row = df[df["train_id"] == train_id].iloc[0]
        exp = pd.to_datetime(row["certificate_expiry"])
        return max(0, (exp - pd.Timestamp.today()).days)
    except Exception:
        return 180

def _get_mileage(train_id: str) -> int:
    try:
        df = pd.read_csv(DATA_DIR / "kmrl_trains_bulk_upload.csv")
        row = df[df["train_id"] == train_id].iloc[0]
        return int(row["current_mileage"])
    except Exception:
        return 300000

def _retrain():
    predictor.train()
