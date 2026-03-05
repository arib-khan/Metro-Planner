"""
models/train_scorer.py

Trains a RandomForest model to predict per-train reliability scores,
then produces a daily priority ranking for the fleet.

Usage:
    from models.train_scorer import TrainScorer
    scorer = TrainScorer()
    scorer.train()                       # builds model from historical data
    ranking = scorer.rank_fleet(today)   # returns sorted list of train dicts
"""

import os
import json
import pickle
import warnings
from datetime import date, datetime

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.preprocessing import LabelEncoder
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, r2_score

warnings.filterwarnings("ignore")

# ── Paths ──────────────────────────────────────────────────────────────────────
BASE_DIR    = os.path.dirname(os.path.abspath(__file__))
DATA_DIR    = os.path.join(BASE_DIR, "..", "data")
MODELS_DIR  = os.path.join(BASE_DIR, "..", "models")
MODEL_FILE  = os.path.join(MODELS_DIR, "reliability_model.pkl")
METRICS_FILE = os.path.join(MODELS_DIR, "model_metrics.json")

DELAYS_CSV  = os.path.join(DATA_DIR, "historical_delays.csv")
REPAIRS_CSV = os.path.join(DATA_DIR, "historical_repairs.csv")
FLEET_CSV   = os.path.join(DATA_DIR, "kmrl_trains.csv")


class TrainScorer:
    """
    Learns from historical delay + repair data to predict a reliability_score
    (0–100) for each train. Higher score = more reliable = higher schedule priority.
    Trains flagged 'not fine' (Open High-priority work orders) are auto-demoted.
    """

    FEATURE_COLS = [
        "avg_delay_7d", "avg_delay_30d", "avg_delay_90d",
        "delay_std_30d", "trip_count_30d",
        "repair_count_90d", "total_repair_duration_90d",
        "high_sev_repairs_90d", "days_since_last_repair",
        "current_mileage", "cert_days_to_expiry",
        "has_open_high_wo",  # critical flag: forced low priority
    ]

    def __init__(self):
        self.model = None
        self.metrics = {}
        self.le_train = LabelEncoder()
        self._is_trained = False

    # ── Feature Engineering ───────────────────────────────────────────────────
    def _build_features(self, target_date: date) -> pd.DataFrame:
        delays_df  = pd.read_csv(DELAYS_CSV,  parse_dates=["date"])
        repairs_df = pd.read_csv(REPAIRS_CSV, parse_dates=["date"])
        fleet_df   = pd.read_csv(FLEET_CSV)

        td = pd.Timestamp(target_date)
        rows = []

        for tid in fleet_df["train_id"].unique():
            t_delays  = delays_df[delays_df["train_id"] == tid]
            t_repairs = repairs_df[repairs_df["train_id"] == tid]
            t_fleet   = fleet_df[fleet_df["train_id"] == tid].iloc[0] if not fleet_df[fleet_df["train_id"] == tid].empty else None

            # Rolling delay windows
            def avg_delay(days):
                cutoff = td - pd.Timedelta(days=days)
                w = t_delays[(t_delays["date"] >= cutoff) & (t_delays["date"] < td)]
                return w["delay_minutes"].mean() if len(w) > 0 else 0.0

            def std_delay(days):
                cutoff = td - pd.Timedelta(days=days)
                w = t_delays[(t_delays["date"] >= cutoff) & (t_delays["date"] < td)]
                return w["delay_minutes"].std() if len(w) > 1 else 0.0

            def trip_count(days):
                cutoff = td - pd.Timedelta(days=days)
                w = t_delays[(t_delays["date"] >= cutoff) & (t_delays["date"] < td)]
                return len(w)

            # Rolling repair windows
            def repair_stats(days):
                cutoff = td - pd.Timedelta(days=days)
                w = t_repairs[(t_repairs["date"] >= cutoff) & (t_repairs["date"] < td)]
                cnt   = len(w)
                total_dur = w["duration_minutes"].sum() if cnt > 0 else 0
                high_sev  = len(w[w["severity"] == "High"]) if cnt > 0 else 0
                return cnt, total_dur, high_sev

            rc, rd, rh = repair_stats(90)

            # Days since last repair
            past_repairs = t_repairs[t_repairs["date"] < td]
            if len(past_repairs) > 0:
                last_r = past_repairs["date"].max()
                dsince = (td - last_r).days
            else:
                dsince = 999

            # Certificate days to expiry
            cert_exp = None
            if t_fleet is not None and "certificate_expiry" in fleet_df.columns:
                try:
                    cert_exp = (pd.Timestamp(t_fleet["certificate_expiry"]) - td).days
                except:
                    cert_exp = 365
            cert_days = cert_exp if cert_exp is not None else 365

            # Mileage
            mileage = t_fleet["current_mileage"] if t_fleet is not None and "current_mileage" in fleet_df.columns else 0

            # Open High-priority work order flag (makes train "not fine")
            has_open_high = 0
            if t_fleet is not None:
                wo_status = str(t_fleet.get("work_order_status", "")).strip()
                priority  = str(t_fleet.get("priority", "")).strip()
                if wo_status == "Open" and priority == "High":
                    has_open_high = 1

            rows.append({
                "train_id": tid,
                "avg_delay_7d":              avg_delay(7),
                "avg_delay_30d":             avg_delay(30),
                "avg_delay_90d":             avg_delay(90),
                "delay_std_30d":             std_delay(30),
                "trip_count_30d":            trip_count(30),
                "repair_count_90d":          rc,
                "total_repair_duration_90d": rd,
                "high_sev_repairs_90d":      rh,
                "days_since_last_repair":    dsince,
                "current_mileage":           mileage,
                "cert_days_to_expiry":       cert_days,
                "has_open_high_wo":          has_open_high,
            })

        return pd.DataFrame(rows)

    # ── Build labelled training data ──────────────────────────────────────────
    def _build_training_set(self) -> pd.DataFrame:
        """
        For each train, compute features at several historical dates
        and derive a ground-truth reliability_score from actual delay data
        in the following 7 days.
        """
        print("  Building training dataset …")
        delays_df  = pd.read_csv(DELAYS_CSV,  parse_dates=["date"])
        sample_dates = pd.date_range("2025-04-01", "2026-01-01", freq="30D")
        all_rows = []

        for td in sample_dates:
            feat_df = self._build_features(td.date())

            # Ground truth: mean delay in next 7 days → invert to reliability
            for _, row in feat_df.iterrows():
                tid = row["train_id"]
                future = delays_df[
                    (delays_df["train_id"] == tid) &
                    (delays_df["date"] >= td) &
                    (delays_df["date"] < td + pd.Timedelta(days=7))
                ]
                future_delay = future["delay_minutes"].mean() if len(future) > 0 else 0.0
                # Reliability score 0–100: lower delay → higher score
                # Max expected delay ~15 min, clip and invert
                score = max(0, 100 - (future_delay / 15.0 * 100))
                score = min(100, score)
                row_dict = row.to_dict()
                row_dict["reliability_score"] = round(score, 2)
                all_rows.append(row_dict)

        df = pd.DataFrame(all_rows).dropna()
        print(f"  Training set: {len(df)} samples across {len(sample_dates)} dates")
        return df

    # ── Train Model ───────────────────────────────────────────────────────────
    def train(self, force: bool = False) -> dict:
        if os.path.exists(MODEL_FILE) and not force:
            print("Loading existing model …")
            with open(MODEL_FILE, "rb") as f:
                self.model = pickle.load(f)
            if os.path.exists(METRICS_FILE):
                with open(METRICS_FILE) as f:
                    self.metrics = json.load(f)
            self._is_trained = True
            return self.metrics

        print("Training reliability model …")
        train_df = self._build_training_set()

        X = train_df[self.FEATURE_COLS]
        y = train_df["reliability_score"]

        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

        # Two models: RandomForest for stable predictions, GBM for comparison
        rf = RandomForestRegressor(n_estimators=150, max_depth=8, random_state=42, n_jobs=-1)
        rf.fit(X_train, y_train)

        y_pred = rf.predict(X_test)
        self.metrics = {
            "mae":     round(float(mean_absolute_error(y_test, y_pred)), 3),
            "r2":      round(float(r2_score(y_test, y_pred)), 3),
            "trained_at": datetime.now().isoformat(),
            "n_samples": len(train_df),
            "feature_importance": {
                col: round(float(imp), 4)
                for col, imp in zip(self.FEATURE_COLS, rf.feature_importances_)
            }
        }

        self.model = rf
        self._is_trained = True

        # Persist
        os.makedirs(MODELS_DIR, exist_ok=True)
        with open(MODEL_FILE, "wb") as f:
            pickle.dump(rf, f)
        with open(METRICS_FILE, "w") as f:
            json.dump(self.metrics, f, indent=2)

        print(f"  Model trained  MAE={self.metrics['mae']}  R²={self.metrics['r2']}")
        return self.metrics

    # ── Rank Fleet ────────────────────────────────────────────────────────────
    def rank_fleet(self, target_date: date = None, retrain: bool = False) -> list[dict]:
        """
        Returns a sorted list of train dicts for the given date.
        Trains with open high-priority work orders are auto-demoted to the bottom.
        """
        if target_date is None:
            target_date = date.today()

        if not self._is_trained or retrain:
            self.train(force=retrain)

        feat_df = self._build_features(target_date)
        X = feat_df[self.FEATURE_COLS]
        feat_df["reliability_score"] = self.model.predict(X)

        # ── Hard rule: flag trains with open High WO as "not fine" ────────────
        feat_df["is_fit"] = feat_df["has_open_high_wo"].apply(lambda x: x == 0)

        # ── Penalty: open High WO forces score to bottom (<10) ────────────────
        feat_df.loc[feat_df["has_open_high_wo"] == 1, "reliability_score"] = \
            feat_df.loc[feat_df["has_open_high_wo"] == 1, "reliability_score"] * 0.08

        # ── Cert expiry warning (<30 days → slight penalty) ───────────────────
        feat_df.loc[feat_df["cert_days_to_expiry"] < 30, "reliability_score"] -= 5

        feat_df["reliability_score"] = feat_df["reliability_score"].clip(0, 100).round(2)
        feat_df["schedule_rank"] = feat_df["reliability_score"].rank(
            ascending=False, method="first").astype(int)

        # Build output
        result = []
        for _, row in feat_df.sort_values("schedule_rank").iterrows():
            result.append({
                "rank":                    int(row["schedule_rank"]),
                "train_id":                row["train_id"],
                "reliability_score":       round(float(row["reliability_score"]), 2),
                "is_fit":                  bool(row["is_fit"]),
                "has_open_high_wo":        bool(row["has_open_high_wo"]),
                "avg_delay_7d":            round(float(row["avg_delay_7d"]), 2),
                "avg_delay_30d":           round(float(row["avg_delay_30d"]), 2),
                "repair_count_90d":        int(row["repair_count_90d"]),
                "high_sev_repairs_90d":    int(row["high_sev_repairs_90d"]),
                "days_since_last_repair":  int(row["days_since_last_repair"]),
                "current_mileage":         int(row["current_mileage"]),
                "cert_days_to_expiry":     int(row["cert_days_to_expiry"]),
                "status": (
                    "NOT_FIT"   if bool(row["has_open_high_wo"]) else
                    "CERT_WARN" if int(row["cert_days_to_expiry"]) < 30 else
                    "FIT"
                ),
            })
        return result

    # ── Demand Forecast ───────────────────────────────────────────────────────
    def forecast_demand(self, target_date: date = None) -> dict:
        """
        Returns predicted peak demand hours and busiest stations for a given date.
        Simple aggregation-based forecast from historical demand data.
        """
        if target_date is None:
            target_date = date.today()

        demand_csv = os.path.join(DATA_DIR, "historical_demand.csv")
        if not os.path.exists(demand_csv):
            return {}

        demand_df = pd.read_csv(demand_csv)
        is_weekend = int(target_date.weekday() >= 5)
        subset = demand_df[demand_df["is_weekend"] == is_weekend]

        # Average by station + hour
        avg = subset.groupby(["station", "hour"])["passenger_count"].mean().reset_index()
        avg.columns = ["station", "hour", "expected_passengers"]
        avg["expected_passengers"] = avg["expected_passengers"].round(0).astype(int)

        # Peak hours (top 3 globally)
        hour_totals = avg.groupby("hour")["expected_passengers"].sum().sort_values(ascending=False)
        peak_hours = hour_totals.head(3).index.tolist()

        # Busiest stations
        station_totals = avg.groupby("station")["expected_passengers"].sum().sort_values(ascending=False)
        busiest = station_totals.head(5).reset_index()
        busiest.columns = ["station", "total_expected"]

        return {
            "date": target_date.isoformat(),
            "is_weekend": bool(is_weekend),
            "peak_hours": peak_hours,
            "busiest_stations": busiest.to_dict(orient="records"),
            "hourly_by_station": avg.to_dict(orient="records"),
        }


# ── CLI test ───────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import sys
    scorer = TrainScorer()
    print("=== Training Model ===")
    metrics = scorer.train(force=True)
    print(json.dumps(metrics, indent=2))

    print("\n=== Fleet Ranking (today) ===")
    ranking = scorer.rank_fleet(date.today())
    for r in ranking:
        flag = "⚠️ NOT FIT" if r["has_open_high_wo"] else ("⚡ CERT WARN" if r["status"] == "CERT_WARN" else "✅")
        print(f"  [{r['rank']:2d}] {r['train_id']:8s}  score={r['reliability_score']:5.1f}  "
              f"delay7d={r['avg_delay_7d']:4.1f}m  repairs90d={r['repair_count_90d']:2d}  {flag}")
