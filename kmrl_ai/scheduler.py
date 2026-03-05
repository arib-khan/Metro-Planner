"""
scheduler.py — KMRL AI Fleet Ranking & Schedule Builder
========================================================
Priority scoring formula (0–100):
  +40  Fitness score  (certificates valid, days remaining)
  +25  Mileage score  (lower mileage → higher score)
  +20  Maintenance score (no open/pending jobs → max score)
  +15  ML delay risk score (low predicted delay → high score)

Trains marked unfit automatically receive priority_score = 0
and are sorted to the bottom of every schedule.
"""

import pandas as pd
import numpy as np
from pathlib import Path
from datetime import datetime, date
from typing import List, Optional, Dict, Any


# ── KMRL Timetable constants (mirrors scheduleEngine.js) ─────────────────────
STATIONS = [
    ("Aluva", 0), ("Pulinchodu", 2.5), ("Companypady", 5), ("Ambattukavu", 7.5),
    ("Muttom", 10), ("Kalamassery", 13), ("CUSAT", 16), ("Pathadipalam", 18.5),
    ("Edappally", 21), ("Changampuzha Park", 23.5), ("Palarivattom", 26),
    ("JLN Stadium", 28.5), ("Kaloor Town Hall", 31), ("MG Road", 33.5),
    ("Maharaja's College", 36), ("Ernakulam South", 38.5), ("Kadavanthra", 41),
    ("Elamkulam", 43.5), ("Vyttila", 46), ("Thaikoodam", 48), ("Petta", 50),
    ("Vadakkekotta", 51.5), ("SN Junction", 53), ("Tripunithura Terminal", 55),
]
ONE_WAY_MIN    = 55
CYCLE_MIN      = 60          # one way + 5 min turnaround
OP_START_MIN   = 6 * 60      # 06:00
OP_END_MIN     = 23 * 60     # 23:00
DWELL_SEC      = 30
TURNAROUND_MIN = 5

DEMAND_MAP = {"low": 0, "medium": 1, "high": 2}


def _fmt(m: float) -> str:
    r = round(m)
    return f"{r // 60:02d}:{r % 60:02d}"

def _days_remaining(expiry_str: str) -> int:
    try:
        exp = datetime.strptime(str(expiry_str)[:10], "%Y-%m-%d")
        return max(0, (exp - datetime.today()).days)
    except Exception:
        return 0


class KMRLScheduler:
    def __init__(self, data_dir: Path):
        self.data_dir = data_dir
        self._fleet_df: Optional[pd.DataFrame] = None
        self._load_fleet()

    # ── Data loading ────────────────────────────────────────────────────────────
    def _load_fleet(self):
        csv = self.data_dir / "kmrl_trains_bulk_upload.csv"
        if csv.exists():
            self._fleet_df = pd.read_csv(csv)
        else:
            self._fleet_df = pd.DataFrame()

    def get_train_row(self, train_id: str) -> Optional[dict]:
        if self._fleet_df is None or self._fleet_df.empty:
            return None
        rows = self._fleet_df[self._fleet_df["train_id"] == train_id]
        return rows.iloc[0].to_dict() if not rows.empty else None

    # ── Fleet ranking ───────────────────────────────────────────────────────────
    def build_ranked_fleet(self, target_date: str, predictor) -> List[Dict[str, Any]]:
        """
        Returns all 30 trains sorted by priority_score descending.
        Unfit trains have score=0 and appear last.
        """
        if self._fleet_df is None or self._fleet_df.empty:
            return []

        results = []
        for _, row in self._fleet_df.iterrows():
            train_id = str(row["train_id"])
            is_fit, fit_reason = self._check_fitness(row, target_date)

            # --- Component scores ---
            fitness_score      = self._fitness_score(row, target_date) if is_fit else 0
            mileage_score      = self._mileage_score(row)
            maintenance_score  = self._maintenance_score(row)

            # ML delay prediction
            try:
                pred = predictor.predict({
                    "cert_days_remaining": _days_remaining(row.get("certificate_expiry", "2099-12-31")),
                    "mileage_km":          int(row.get("current_mileage", 300000)),
                    "had_maintenance":     1 if str(row.get("work_order_status", "")).lower() in ("open", "pending") else 0,
                    "day_of_week":         datetime.strptime(target_date, "%Y-%m-%d").weekday(),
                    "hour_of_day":         6,
                    "demand_level":        "medium",
                    "direction":           "Northbound",
                    "weather_code":        0,
                    "incident_flag":       0,
                })
                predicted_delay = pred
            except Exception:
                predicted_delay = 0.0

            delay_score    = max(0, 15 - predicted_delay * 1.5)   # 15 pts max, degrades with risk
            risk_level     = "low" if predicted_delay < 3 else ("medium" if predicted_delay < 8 else "high")

            if is_fit:
                priority_score = round(fitness_score + mileage_score + maintenance_score + delay_score, 1)
            else:
                priority_score = 0.0       # ← unfit trains always score 0

            results.append({
                "train_id":              train_id,
                "is_fit":                is_fit,
                "fit_reason":            fit_reason,
                "priority_score":        priority_score,
                "fitness_score":         round(fitness_score, 1),
                "mileage_score":         round(mileage_score, 1),
                "maintenance_score":     round(maintenance_score, 1),
                "delay_risk_score":      round(delay_score, 1),
                "predicted_delay_min":   predicted_delay,
                "risk_level":            risk_level,
                "cert_expiry":           str(row.get("certificate_expiry", "")),
                "cert_days_remaining":   _days_remaining(row.get("certificate_expiry", "2099-12-31")),
                "current_mileage":       int(row.get("current_mileage", 0)),
                "work_order_status":     str(row.get("work_order_status", "")),
                "depot":                 str(row.get("depot", "")),
            })

        # Sort: fit trains first (by score desc), then unfit trains last
        results.sort(key=lambda x: (x["is_fit"], x["priority_score"]), reverse=True)
        # Assign schedule slot rank
        for i, t in enumerate(results):
            t["schedule_rank"] = i + 1

        return results

    # ── Schedule builder ────────────────────────────────────────────────────────
    def build_ai_schedule(self, target_date: str, predictor, num_slots: int = 25) -> List[Dict]:
        """
        Assigns trains to departure slots in priority order.
        Returns a list of {slot, dep_time, train_id, direction, predicted_delay, ...}
        """
        ranked = self.build_ranked_fleet(target_date, predictor)
        # How many trains can actually run in a 17-hour window with 60-min cycle?
        # Each train can do ≈ 17 trips; we need one per slot.
        schedule = []
        dt = datetime.strptime(target_date, "%Y-%m-%d")

        for slot_idx in range(num_slots):
            dep_min   = OP_START_MIN + slot_idx * 2          # stagger departures by 2 min
            direction = "Northbound" if slot_idx % 2 == 0 else "Southbound"

            # Pick the best available train for this slot
            train_idx = slot_idx % len(ranked)
            train     = ranked[train_idx]

            # Get demand estimate for this time of day
            demand = _estimate_demand(dep_min)

            # Refined delay prediction for this specific slot
            try:
                refined_pred = predictor.predict({
                    "cert_days_remaining": train["cert_days_remaining"],
                    "mileage_km":          train["current_mileage"],
                    "had_maintenance":     1 if train["work_order_status"] in ("Open", "Pending") else 0,
                    "day_of_week":         dt.weekday(),
                    "hour_of_day":         dep_min // 60,
                    "demand_level":        demand,
                    "direction":           direction,
                    "weather_code":        0,
                    "incident_flag":       0,
                })
            except Exception:
                refined_pred = train["predicted_delay_min"]

            risk = "low" if refined_pred < 3 else ("medium" if refined_pred < 8 else "high")

            schedule.append({
                "slot":                  slot_idx + 1,
                "dep_time":              _fmt(dep_min),
                "dep_min":               dep_min,
                "arr_time":              _fmt(dep_min + ONE_WAY_MIN),
                "train_id":              train["train_id"],
                "direction":             direction,
                "is_fit":                train["is_fit"],
                "priority_score":        train["priority_score"],
                "predicted_delay_min":   refined_pred,
                "risk_level":            risk,
                "demand_level":          demand,
                "note": "⚠️ UNFIT — lowest priority" if not train["is_fit"] else "",
            })

        return schedule

    def build_trips_for_train(self, train_id: str, target_date: str, predictor) -> List[Dict]:
        """All trips a specific train makes in a day."""
        trips = []
        trip_num = 0
        dep_min   = OP_START_MIN
        direction = "Northbound"
        while dep_min + ONE_WAY_MIN <= OP_END_MIN:
            arr_min = dep_min + ONE_WAY_MIN
            demand  = _estimate_demand(dep_min)
            try:
                delay = predictor.predict({
                    "cert_days_remaining": _days_remaining(self.get_train_row(train_id).get("certificate_expiry", "2099-12-31")),
                    "mileage_km":          int(self.get_train_row(train_id).get("current_mileage", 300000)),
                    "had_maintenance":     0,
                    "day_of_week":         datetime.strptime(target_date, "%Y-%m-%d").weekday(),
                    "hour_of_day":         dep_min // 60,
                    "demand_level":        demand,
                    "direction":           direction,
                    "weather_code":        0,
                    "incident_flag":       0,
                })
            except Exception:
                delay = 0.0

            trips.append({
                "trip_num":     trip_num + 1,
                "direction":    direction,
                "dep_time":     _fmt(dep_min),
                "arr_time":     _fmt(arr_min),
                "dep_min":      dep_min,
                "arr_min":      arr_min,
                "demand":       demand,
                "predicted_delay_min": delay,
                "risk_level":   "low" if delay < 3 else ("medium" if delay < 8 else "high"),
            })

            dep_min  += CYCLE_MIN
            direction = "Southbound" if direction == "Northbound" else "Northbound"
            trip_num += 1

        return trips

    # ── Scoring sub-functions ───────────────────────────────────────────────────
    def _check_fitness(self, row, target_date: str):
        certs = ["rolling_stock_certificate", "signalling_certificate", "telecom_certificate"]
        for c in certs:
            val = str(row.get(c, "")).strip().lower()
            if val not in ("valid", "1", "true", "yes"):
                return False, f"{c} is {val}"
        expiry = str(row.get("certificate_expiry", ""))
        if expiry:
            days = _days_remaining(expiry)
            if days <= 0:
                return False, f"Certificate expired ({expiry})"
        return True, "All certificates valid"

    def _fitness_score(self, row, target_date: str) -> float:
        """0–40 based on days remaining on certificate."""
        days = _days_remaining(row.get("certificate_expiry", "2099-12-31"))
        # 40 pts for 365+ days, scales down linearly to 0 at 0 days
        return min(40.0, days / 365 * 40)

    def _mileage_score(self, row) -> float:
        """0–25. Lower mileage → higher score."""
        mileage = int(row.get("current_mileage", 300000))
        # assume max mileage ~450,000 km before replacement
        score = max(0, (450000 - mileage) / 450000 * 25)
        return score

    def _maintenance_score(self, row) -> float:
        """0–20. No open/pending jobs → 20 pts."""
        status = str(row.get("work_order_status", "")).strip().lower()
        if status in ("open",):
            return 5.0
        if status in ("pending",):
            return 10.0
        if status in ("completed", ""):
            return 20.0
        return 15.0


# ── Demand estimation ──────────────────────────────────────────────────────────
def _estimate_demand(dep_min: int) -> str:
    hour = dep_min // 60
    if 8 <= hour <= 10 or 17 <= hour <= 20:
        return "high"
    elif 11 <= hour <= 16:
        return "medium"
    else:
        return "low"
