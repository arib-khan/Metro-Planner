"""
generate_historical.py
Generates synthetic historical logs for KMRL trains.
Run once: python generate_historical.py
Outputs:
  - historical_delays.csv   : per-trip delay records
  - historical_repairs.csv  : maintenance/repair events
  - historical_demand.csv   : hourly passenger demand per station
"""

import pandas as pd
import numpy as np
import random
from datetime import date, timedelta

random.seed(42)
np.random.seed(42)

TRAIN_IDS = [f"KMRL-{i}" for i in range(1, 31)]
STATIONS = [
    "Aluva", "Pulinchodu", "Companypady", "Ambattukavu", "Muttom",
    "Kalamassery", "CUSAT", "Pathadipalam", "Edappally", "Changampuzha Park",
    "Palarivattom", "JLN Stadium", "Kaloor Town Hall", "MG Road",
    "Maharaja's College", "Ernakulam South", "Kadavanthra", "Elamkulam",
    "Vyttila", "Thaikoodam", "Petta", "Vadakkekotta", "SN Junction",
    "Tripunithura Terminal"
]

START_DATE = date(2025, 1, 1)
END_DATE   = date(2026, 2, 27)
DAYS       = (END_DATE - START_DATE).days + 1

# ── 1. Historical Delays ──────────────────────────────────────────────────────
# Each row = one trip for one train on one day.
# Trains with more repairs tend to have more delays.
HIGH_MILEAGE = {"KMRL-10", "KMRL-20", "KMRL-30"}  # worn trains
REPAIR_PRONE = {"KMRL-7", "KMRL-9", "KMRL-13", "KMRL-19", "KMRL-21", "KMRL-25"}

delay_rows = []
for d in range(DAYS):
    dt = START_DATE + timedelta(days=d)
    date_str = dt.isoformat()
    is_weekend = dt.weekday() >= 5
    for tid in TRAIN_IDS:
        # ~8 trips per train per day (17h operation / ~60min cycle)
        n_trips = random.randint(7, 9)
        for trip_no in range(n_trips):
            base_delay = 0.0
            # Worn/high mileage trains → more delay
            if tid in HIGH_MILEAGE:
                base_delay += np.random.exponential(3.5)
            elif tid in REPAIR_PRONE:
                base_delay += np.random.exponential(2.0)
            else:
                base_delay += np.random.exponential(0.8)
            # Weekends slightly more crowded → minor extra delay
            if is_weekend:
                base_delay += np.random.uniform(0, 1.5)
            delay_min = round(max(0, base_delay), 2)
            delay_rows.append({
                "date": date_str,
                "train_id": tid,
                "trip_no": trip_no + 1,
                "delay_minutes": delay_min,
                "is_weekend": int(is_weekend),
            })

delays_df = pd.DataFrame(delay_rows)
delays_df.to_csv("historical_delays.csv", index=False)
print(f"✓ historical_delays.csv  ({len(delays_df):,} rows)")

# ── 2. Historical Repairs ─────────────────────────────────────────────────────
repair_types = [
    "Brake pad inspection", "Pantograph wire check", "HVAC filter replacement",
    "Door sensor calibration", "Traction motor inspection", "Wheel flange measurement",
    "Coupling mechanism check", "Speedometer calibration", "Battery voltage check",
    "Fire suppression system test", "Air conditioning service", "Passenger door seal replacement"
]
repair_rows = []
for tid in TRAIN_IDS:
    n_repairs = random.randint(2, 12)
    if tid in REPAIR_PRONE or tid in HIGH_MILEAGE:
        n_repairs = random.randint(10, 25)
    for _ in range(n_repairs):
        rdate = START_DATE + timedelta(days=random.randint(0, DAYS - 1))
        duration = random.randint(30, 360)  # minutes
        repair_rows.append({
            "date": rdate.isoformat(),
            "train_id": tid,
            "repair_type": random.choice(repair_types),
            "duration_minutes": duration,
            "downtime_trips_lost": duration // 60,
            "severity": random.choice(["Low", "Medium", "High"]),
        })

repairs_df = pd.DataFrame(repair_rows).sort_values(["train_id", "date"]).reset_index(drop=True)
repairs_df.to_csv("historical_repairs.csv", index=False)
print(f"✓ historical_repairs.csv ({len(repairs_df):,} rows)")

# ── 3. Historical Demand (hourly station counts) ──────────────────────────────
# Peak hours: 8-10, 17-20. Busy stations: MG Road, Edappally, Aluva
BUSY_STATIONS = {"MG Road", "Edappally", "Aluva", "Ernakulam South", "Kalamassery"}
demand_rows = []
for d in range(0, DAYS, 7):   # weekly sample to keep size manageable
    dt = START_DATE + timedelta(days=d)
    date_str = dt.isoformat()
    is_weekend = dt.weekday() >= 5
    for station in STATIONS:
        for hour in range(6, 23):
            # Morning peak 8-10, evening peak 17-20
            is_am_peak = 8 <= hour <= 10
            is_pm_peak = 17 <= hour <= 20
            base = 200 if station in BUSY_STATIONS else 80
            if is_am_peak or is_pm_peak:
                base *= 2.5
            if is_weekend:
                base *= 0.7
            count = int(np.random.poisson(base))
            demand_rows.append({
                "date": date_str,
                "station": station,
                "hour": hour,
                "passenger_count": count,
                "is_weekend": int(is_weekend),
                "is_am_peak": int(is_am_peak),
                "is_pm_peak": int(is_pm_peak),
            })

demand_df = pd.DataFrame(demand_rows)
demand_df.to_csv("historical_demand.csv", index=False)
print(f"✓ historical_demand.csv  ({len(demand_df):,} rows)")
print("\nAll historical data generated successfully.")
