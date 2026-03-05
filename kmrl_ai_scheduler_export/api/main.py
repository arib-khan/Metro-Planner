"""
api/main.py

KMRL AI-Driven Train Scheduler — FastAPI Backend

Endpoints:
  GET  /schedule/today          → AI-ranked fleet for today
  GET  /schedule/{date}         → AI-ranked fleet for a specific date (YYYY-MM-DD)
  GET  /fleet/status            → Full fleet status (fit, not-fit, cert warnings)
  GET  /demand/forecast         → Passenger demand forecast for today
  GET  /demand/forecast/{date}  → Demand forecast for a specific date
  GET  /model/metrics           → Current model performance stats
  POST /model/retrain           → Force retrain with latest data
  POST /logs/delay              → Submit a new delay event (online learning feed)
  GET  /health                  → Health check

Run with:
    uvicorn api.main:app --reload --port 8000

Or directly:
    python -m uvicorn api.main:app --reload --port 8000
"""

import os
import sys
import json
import csv
from datetime import date, datetime
from typing import Optional

# ── Add parent to path ─────────────────────────────────────────────────────────
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from models.train_scorer import TrainScorer

# ── App setup ─────────────────────────────────────────────────────────────────
app = FastAPI(
    title="KMRL AI Schedule Engine",
    description="AI-driven train scheduling for Kochi Metro (KMRL)",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],      # tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Scorer singleton ──────────────────────────────────────────────────────────
scorer = TrainScorer()

@app.on_event("startup")
async def startup():
    """Load or train model on startup."""
    scorer.train()


# ── Pydantic schemas ──────────────────────────────────────────────────────────
class DelayLog(BaseModel):
    train_id: str
    date: str           # YYYY-MM-DD
    trip_no: int = 1
    delay_minutes: float
    is_weekend: int = 0

class RetrainRequest(BaseModel):
    force: bool = True


# ── Helpers ───────────────────────────────────────────────────────────────────
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")

def parse_date(date_str: str) -> date:
    try:
        return datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid date format: {date_str}. Use YYYY-MM-DD.")

def build_schedule_response(ranking: list, target_date: date) -> dict:
    fit     = [t for t in ranking if t["is_fit"] and t["status"] != "CERT_WARN"]
    warn    = [t for t in ranking if t["status"] == "CERT_WARN"]
    not_fit = [t for t in ranking if not t["is_fit"]]
    return {
        "date": target_date.isoformat(),
        "generated_at": datetime.now().isoformat(),
        "summary": {
            "total_trains":    len(ranking),
            "fit_trains":      len(fit),
            "cert_warnings":   len(warn),
            "not_fit_trains":  len(not_fit),
        },
        "schedule": ranking,
    }


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "service": "KMRL AI Scheduler", "time": datetime.now().isoformat()}


@app.get("/schedule/today")
def schedule_today():
    """AI-ranked train schedule for today."""
    today = date.today()
    ranking = scorer.rank_fleet(today)
    return build_schedule_response(ranking, today)


@app.get("/schedule/{date_str}")
def schedule_for_date(date_str: str):
    """AI-ranked train schedule for a specific date."""
    target = parse_date(date_str)
    ranking = scorer.rank_fleet(target)
    return build_schedule_response(ranking, target)


@app.get("/fleet/status")
def fleet_status():
    """Detailed fleet status grouped by condition."""
    today = date.today()
    ranking = scorer.rank_fleet(today)
    return {
        "date": today.isoformat(),
        "fit": [t for t in ranking if t["status"] == "FIT"],
        "cert_warning": [t for t in ranking if t["status"] == "CERT_WARN"],
        "not_fit": [t for t in ranking if t["status"] == "NOT_FIT"],
    }


@app.get("/demand/forecast")
def demand_today():
    """Passenger demand forecast for today."""
    result = scorer.forecast_demand(date.today())
    if not result:
        raise HTTPException(status_code=404, detail="Demand data not available.")
    return result


@app.get("/demand/forecast/{date_str}")
def demand_for_date(date_str: str):
    """Passenger demand forecast for a specific date."""
    target = parse_date(date_str)
    result = scorer.forecast_demand(target)
    if not result:
        raise HTTPException(status_code=404, detail="Demand data not available.")
    return result


@app.get("/model/metrics")
def model_metrics():
    """Return current model performance metrics."""
    metrics_file = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "models", "model_metrics.json"
    )
    if os.path.exists(metrics_file):
        with open(metrics_file) as f:
            return json.load(f)
    return {"error": "Model not yet trained."}


@app.post("/model/retrain")
def retrain_model(req: RetrainRequest, background_tasks: BackgroundTasks):
    """Trigger model retraining in the background."""
    def do_train():
        scorer.train(force=req.force)

    background_tasks.add_task(do_train)
    return {"message": "Model retraining started in background.", "force": req.force}


@app.post("/logs/delay")
def log_delay(entry: DelayLog):
    """
    Append a new delay event to the live log CSV.
    These will be incorporated on next retrain.
    """
    log_path = os.path.join(DATA_DIR, "historical_delays.csv")
    row = {
        "date": entry.date,
        "train_id": entry.train_id,
        "trip_no": entry.trip_no,
        "delay_minutes": entry.delay_minutes,
        "is_weekend": entry.is_weekend,
    }
    file_exists = os.path.exists(log_path)
    with open(log_path, "a", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=row.keys())
        if not file_exists:
            writer.writeheader()
        writer.writerow(row)
    return {"message": f"Delay logged for {entry.train_id} on {entry.date}.", "data": row}
