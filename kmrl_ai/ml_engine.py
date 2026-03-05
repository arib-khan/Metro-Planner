"""
ml_engine.py — KMRL Delay Prediction using Gradient Boosted Trees
=================================================================
Features used:
  - cert_days_remaining   : days until fitness certificate expires
  - mileage_km            : odometer reading
  - had_maintenance       : boolean, recent maintenance job open
  - day_of_week           : 0=Mon … 6=Sun
  - hour_of_day           : departure hour
  - demand_level_enc      : low=0, medium=1, high=2
  - direction_enc         : Northbound=0, Southbound=1
  - weather_code          : 0=clear, 1=rain, 2=storm
  - incident_flag         : historical incident on same route/time
"""

import pandas as pd
import numpy as np
import joblib
import json
from pathlib import Path
from datetime import datetime, date
from typing import Optional

from sklearn.ensemble import GradientBoostingRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.preprocessing import LabelEncoder


FEATURES = [
    "cert_days_remaining",
    "mileage_km",
    "had_maintenance",
    "day_of_week",
    "hour_of_day",
    "demand_level_enc",
    "direction_enc",
    "weather_code",
    "incident_flag",
]

DEMAND_MAP = {"low": 0, "medium": 1, "high": 2}
DIRECTION_MAP = {"Northbound": 0, "Southbound": 1}


class DelayPredictor:
    def __init__(self, data_dir: Path, model_dir: Path):
        self.data_dir  = data_dir
        self.model_dir = model_dir
        self.model: Optional[GradientBoostingRegressor] = None
        self.info_path = model_dir / "model_info.json"
        self._info = {}

    # ── Training ────────────────────────────────────────────────────────────────
    def train(self) -> dict:
        """
        Trains on all available data:
          1. data/historical_logs.csv   (seeded historical data)
          2. logs/delay_events.csv      (live accumulated events)
        Returns performance metrics dict.
        """
        df = self._load_all_data()
        if df.empty or len(df) < 5:
            # Not enough data — return a trivial baseline
            self._info = {"status": "insufficient_data", "n_samples": len(df)}
            return self._info

        df = self._featurise(df)
        X = df[FEATURES]
        y = df["delay_min"].clip(lower=0)   # no negative delays

        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42
        )

        self.model = GradientBoostingRegressor(
            n_estimators=150,
            max_depth=4,
            learning_rate=0.08,
            subsample=0.8,
            random_state=42,
        )
        self.model.fit(X_train, y_train)

        preds = self.model.predict(X_test)
        mae   = round(float(mean_absolute_error(y_test, preds)), 2)
        r2    = round(float(r2_score(y_test, preds)), 3)

        # Feature importance
        importance = dict(zip(FEATURES, self.model.feature_importances_.round(3)))

        self._info = {
            "status": "trained",
            "n_samples": len(df),
            "mae_minutes": mae,
            "r2_score": r2,
            "trained_at": datetime.utcnow().isoformat(),
            "feature_importance": importance,
        }

        # Persist
        joblib.dump(self.model, self.model_dir / "delay_model.joblib")
        with open(self.info_path, "w") as f:
            json.dump(self._info, f, indent=2)

        return self._info

    def load(self):
        model_path = self.model_dir / "delay_model.joblib"
        if model_path.exists():
            self.model = joblib.load(model_path)
        if self.info_path.exists():
            with open(self.info_path) as f:
                self._info = json.load(f)

    def get_info(self) -> dict:
        return self._info

    # ── Inference ───────────────────────────────────────────────────────────────
    def predict(self, features: dict) -> float:
        """Predict delay (minutes) from a features dict. Returns 0.0 if no model."""
        if self.model is None:
            return 0.0
        row = pd.DataFrame([{
            "cert_days_remaining": features.get("cert_days_remaining", 365),
            "mileage_km":          features.get("mileage_km", 300000),
            "had_maintenance":     features.get("had_maintenance", 0),
            "day_of_week":         features.get("day_of_week", 0),
            "hour_of_day":         features.get("hour_of_day", 6),
            "demand_level_enc":    DEMAND_MAP.get(features.get("demand_level", "medium"), 1),
            "direction_enc":       DIRECTION_MAP.get(features.get("direction", "Northbound"), 0),
            "weather_code":        features.get("weather_code", 0),
            "incident_flag":       features.get("incident_flag", 0),
        }])
        pred = self.model.predict(row)[0]
        return max(0.0, round(float(pred), 1))

    def predict_single(self, train_id: str, dep_min: int, direction: str,
                       demand_level: str, target_date: str, scheduler) -> dict:
        """High-level single prediction with context from the fleet data."""
        train_row = scheduler.get_train_row(train_id)
        if train_row is None:
            raise ValueError(f"Train {train_id} not found in fleet data")

        dt = datetime.strptime(target_date, "%Y-%m-%d")
        cert_days = _days_remaining(train_row.get("certificate_expiry", "2099-12-31"))
        features = {
            "cert_days_remaining": cert_days,
            "mileage_km":          int(train_row.get("current_mileage", 300000)),
            "had_maintenance":     1 if train_row.get("work_order_status", "") in ("Open", "Pending") else 0,
            "day_of_week":         dt.weekday(),
            "hour_of_day":         dep_min // 60,
            "demand_level":        demand_level,
            "direction":           direction,
            "weather_code":        0,
            "incident_flag":       0,
        }
        delay = self.predict(features)
        risk_level = "low" if delay < 3 else ("medium" if delay < 8 else "high")
        return {
            "train_id":            train_id,
            "dep_min":             dep_min,
            "predicted_delay_min": delay,
            "risk_level":          risk_level,
            "features_used":       features,
        }

    # ── Internal ────────────────────────────────────────────────────────────────
    def _load_all_data(self) -> pd.DataFrame:
        dfs = []
        hist = self.data_dir / "historical_logs.csv"
        live = self.data_dir.parent / "logs" / "delay_events.csv"
        for p in [hist, live]:
            if p.exists():
                try:
                    dfs.append(pd.read_csv(p))
                except Exception:
                    pass
        return pd.concat(dfs, ignore_index=True) if dfs else pd.DataFrame()

    def _featurise(self, df: pd.DataFrame) -> pd.DataFrame:
        df = df.copy()
        df["demand_level_enc"] = df["demand_level"].map(DEMAND_MAP).fillna(1).astype(int)
        df["direction_enc"]    = df["direction"].map(DIRECTION_MAP).fillna(0).astype(int)
        for col in FEATURES + ["delay_min"]:
            if col not in df.columns:
                df[col] = 0
        df["delay_min"]            = pd.to_numeric(df["delay_min"], errors="coerce").fillna(0)
        df["cert_days_remaining"]  = pd.to_numeric(df["cert_days_remaining"],  errors="coerce").fillna(365)
        df["mileage_km"]           = pd.to_numeric(df["mileage_km"],           errors="coerce").fillna(300000)
        df["had_maintenance"]      = pd.to_numeric(df["had_maintenance"],      errors="coerce").fillna(0)
        df["day_of_week"]          = pd.to_numeric(df["day_of_week"],          errors="coerce").fillna(0)
        df["hour_of_day"]          = pd.to_numeric(df["hour_of_day"],          errors="coerce").fillna(6)
        df["weather_code"]         = pd.to_numeric(df["weather_code"],         errors="coerce").fillna(0)
        df["incident_flag"]        = pd.to_numeric(df["incident_flag"],        errors="coerce").fillna(0)
        return df


# ── Helpers ────────────────────────────────────────────────────────────────────
def _days_remaining(expiry_str: str) -> int:
    try:
        exp = datetime.strptime(str(expiry_str)[:10], "%Y-%m-%d")
        return max(0, (exp - datetime.today()).days)
    except Exception:
        return 365
