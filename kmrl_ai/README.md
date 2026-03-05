# KMRL AI Scheduling Engine

A drop-in AI backend for the Kochi Metro Rail scheduling system.
Replaces hard-coded round-robin logic with a **machine-learning-driven priority system**.

---

## Architecture

```
Next.js Frontend (scheduleEngine.js)
         │
         │  HTTP REST
         ▼
FastAPI Backend (main.py)
    ├── scheduler.py     ← Fleet ranking + schedule builder
    ├── ml_engine.py     ← Gradient Boosted delay predictor
    └── data/
        ├── kmrl_trains_bulk_upload.csv   ← Fleet master data
        ├── historical_logs.csv           ← Seeded training data
        └── logs/delay_events.csv         ← Live accumulated events
```

---

## How the AI prioritisation works

### Priority Score (0–100)

| Component | Max pts | Logic |
|---|---|---|
| **Fitness** | 40 | Proportional to days remaining on certificate |
| **Mileage** | 25 | Lower odometer = higher score (max ~450k km) |
| **Maintenance** | 20 | No open/pending jobs = full score |
| **Delay Risk** | 15 | ML model: low predicted delay = high score |

**Unfit trains always score 0** and are assigned the lowest-priority departure slots.

### Machine Learning Model

- **Algorithm:** Gradient Boosted Regressor (scikit-learn)
- **Target:** Predicted delay in minutes
- **Features:**
  - `cert_days_remaining` — days until fitness certificate expires
  - `mileage_km` — odometer reading
  - `had_maintenance` — open/pending work order flag
  - `day_of_week`, `hour_of_day` — temporal patterns
  - `demand_level_enc` — low/medium/high passenger demand
  - `direction_enc` — Northbound vs Southbound
  - `weather_code`, `incident_flag` — operational conditions

The model **retrains automatically** every time 10 new delay events are logged via `POST /log/delay`.

---

## Setup

### 1. Install Python dependencies

```bash
pip install fastapi uvicorn pandas numpy scikit-learn joblib pydantic
```

### 2. Start the server

```bash
cd kmrl_ai
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

The model trains automatically on first boot using `data/historical_logs.csv`.

### 3. Configure the Next.js frontend

In your `.env.local`:

```env
NEXT_PUBLIC_AI_API_BASE=http://localhost:8000
```

Replace `scheduleEngine.js` with the new AI-aware version. All existing imports continue to work.

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/fleet?target_date=YYYY-MM-DD` | AI-ranked fleet (30 trains) |
| `GET` | `/schedule?target_date=&num_slots=` | AI-optimised departure schedule |
| `GET` | `/schedule/{train_id}` | Single train's day schedule |
| `GET` | `/predict/delay/{train_id}` | Delay prediction for one departure |
| `GET` | `/analytics/delay-risk` | Fleet-wide risk summary |
| `POST` | `/log/delay` | Record actual delay → feeds retraining |
| `POST` | `/model/retrain` | Manual model retrain trigger |
| `GET` | `/model/info` | Model metrics (MAE, R², feature importance) |

### Example: Log a delay

```bash
curl -X POST http://localhost:8000/log/delay \
  -H "Content-Type: application/json" \
  -d '{
    "train_id": "KMRL-7",
    "scheduled_dep_min": 480,
    "actual_dep_min": 487,
    "direction": "Northbound",
    "demand_level": "high",
    "had_maintenance": 1
  }'
```

### Example: Get today's AI schedule

```bash
curl http://localhost:8000/schedule?num_slots=10
```

---

## Frontend integration (scheduleEngine.js changes)

### Minimal change to use AI scheduling

```js
// Before (hard-coded)
const fleet = buildFleet(masterData, dailyDocs, date);

// After (AI-driven, with automatic fallback)
const fleet = await buildFleet(masterData, dailyDocs, date, /* useAI= */ true);
```

### Show delay risk badges in your UI

```js
const fleet = await fetchAIFleet();
fleet.forEach(train => {
  console.log(train.train_id, train.risk_level, train.predicted_delay_min + 'min');
});
```

### Log delays after each trip completes

```js
await logDelayEvent({
  train_id: 'KMRL-5',
  scheduled_dep_min: 480,
  actual_dep_min: 486,
  direction: 'Northbound',
  demand_level: 'high',
  had_maintenance: 0,
});
```

---

## Files

| File | Purpose |
|---|---|
| `main.py` | FastAPI app, all REST endpoints |
| `scheduler.py` | Fleet scoring + AI schedule builder |
| `ml_engine.py` | GBT delay predictor, training, inference |
| `scheduleEngine.js` | Updated Next.js engine (drop-in replacement) |
| `data/historical_logs.csv` | Seeded training data (50 records) |
| `data/kmrl_trains_bulk_upload.csv` | Fleet master data |
| `requirements.txt` | Python dependencies |
