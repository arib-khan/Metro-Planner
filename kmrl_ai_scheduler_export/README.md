# KMRL AI-Driven Train Scheduler

Replaces the hard-coded KMRL schedule with a machine-learning system that:
- **Ranks trains by reliability** using a RandomForest model (R² = 0.95)
- **Auto-demotes NOT FIT trains** (open High-priority work orders) to lowest priority
- **Learns from historical data** — delays, repairs, mileage, certificate expiry
- **Forecasts demand** by station and hour
- **Serves everything via a FastAPI REST backend** consumed by your existing Next.js frontend

---

## Project Structure

```
kmrl_ai_scheduler/
├── data/
│   ├── kmrl_trains.csv             ← your fleet CSV (source of truth)
│   ├── generate_historical.py      ← run once to seed historical data
│   ├── historical_delays.csv       ← per-trip delay log (grows over time)
│   ├── historical_repairs.csv      ← repair/maintenance events
│   └── historical_demand.csv       ← hourly passenger counts by station
│
├── models/
│   ├── train_scorer.py             ← ML engine (feature engineering + RandomForest)
│   ├── reliability_model.pkl       ← serialised model (auto-generated)
│   └── model_metrics.json          ← MAE, R², feature importance
│
├── api/
│   └── main.py                     ← FastAPI application
│
├── tests/
│   └── test_scheduler.py           ← standalone tests (no server needed)
│
├── scheduleEngine.js               ← drop-in replacement for your original file
├── requirements.txt
└── README.md
```

---

## Quick Start

### 1. Install dependencies

```bash
pip install -r requirements.txt
```

### 2. Generate historical data (first time only)

```bash
cd data
python generate_historical.py
```

### 3. Start the API server

```bash
uvicorn api.main:app --reload --port 8000
```

The server loads (or trains) the model automatically on startup.

### 4. Test without the server

```bash
python tests/test_scheduler.py
```

---

## REST API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/schedule/today` | AI-ranked fleet for today |
| GET | `/schedule/{YYYY-MM-DD}` | AI-ranked fleet for any date |
| GET | `/fleet/status` | Fleet split: fit / cert-warn / not-fit |
| GET | `/demand/forecast` | Demand forecast for today |
| GET | `/demand/forecast/{YYYY-MM-DD}` | Demand forecast for any date |
| GET | `/model/metrics` | MAE, R², feature importances |
| POST | `/model/retrain` | Force model retrain |
| POST | `/logs/delay` | Submit a real-time delay event |

### Example: `/schedule/today` response

```json
{
  "date": "2026-03-03",
  "summary": {
    "total_trains": 30,
    "fit_trains": 26,
    "cert_warnings": 0,
    "not_fit_trains": 4
  },
  "schedule": [
    {
      "rank": 1,
      "train_id": "KMRL-28",
      "reliability_score": 93.5,
      "is_fit": true,
      "status": "FIT",
      "avg_delay_7d": 0.9,
      "repair_count_90d": 4
    },
    ...
    {
      "rank": 30,
      "train_id": "KMRL-9",
      "reliability_score": 6.8,
      "is_fit": false,
      "status": "NOT_FIT",
      "has_open_high_wo": true
    }
  ]
}
```

### Example: POST `/logs/delay`

```json
{
  "train_id": "KMRL-5",
  "date": "2026-03-03",
  "trip_no": 3,
  "delay_minutes": 4.5,
  "is_weekend": 0
}
```

---

## Integrating with Your Next.js Frontend

Replace your import in `page.jsx` (and anywhere else you use `scheduleEngine.js`):

```js
// Before (hard-coded)
import { buildAllTrips, buildFleet } from '@/lib/scheduleEngine';

// After (AI-powered — all original functions still work)
import {
  buildFleet,
  buildAllTrips,       // original fallback
  buildAllTripsAI,     // AI-prioritised version ← use this
  fetchAISchedule,
  fetchFleetStatus,
  fetchDemandForecast,
  logDelayEvent,
} from '@/lib/scheduleEngine';
```

### Minimal page.jsx integration

```jsx
"use client";
import { useState, useEffect } from 'react';
import { fetchAISchedule, buildAllTripsAI, buildFleet } from '@/lib/scheduleEngine';

export default function SchedulePage() {
  const [aiData,   setAiData]   = useState(null);
  const [trips,    setTrips]    = useState([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    async function load() {
      const result = await fetchAISchedule();     // calls Python backend
      setAiData(result);

      // Build timetable trips using AI priority order
      const fleet = buildFleet(masterData, dailyDocs, todayStr());
      const aiTrips = buildAllTripsAI(result.schedule, fleet);
      setTrips(aiTrips);
      setLoading(false);
    }
    load();
    const id = setInterval(load, 60_000); // refresh every minute
    return () => clearInterval(id);
  }, []);

  if (loading) return <div>Loading AI schedule…</div>;

  return (
    <div>
      <p>Fit trains: {aiData.summary.fit_trains} / {aiData.summary.total_trains}</p>
      {aiData.summary.not_fit_trains > 0 && (
        <p>⚠️ {aiData.summary.not_fit_trains} trains removed from service (NOT FIT)</p>
      )}
      {/* render trips as before */}
    </div>
  );
}
```

### Adding real-time delay feedback

Whenever you detect or record a delay, push it to the learning log:

```js
import { logDelayEvent } from '@/lib/scheduleEngine';

await logDelayEvent({
  train_id: 'KMRL-5',
  date: '2026-03-03',
  trip_no: 3,
  delay_minutes: 4.5,
  is_weekend: 0,
});
```

These events are appended to `historical_delays.csv` and used in the next retrain.

---

## How the AI Works

### Features used by the model

| Feature | Why it matters |
|---------|----------------|
| `avg_delay_90d` | Most predictive — chronic delay history |
| `delay_std_30d` | Inconsistency is a warning sign |
| `avg_delay_7d` | Recent performance (recency bias) |
| `current_mileage` | Higher mileage → more wear |
| `repair_count_90d` | Frequency of maintenance events |
| `high_sev_repairs_90d` | Severity of past faults |
| `cert_days_to_expiry` | Certificate health |
| `has_open_high_wo` | **Hard rule**: forces score to ~7/100** |

### Scoring logic

1. RandomForest predicts a `reliability_score` (0–100) per train
2. `has_open_high_wo = 1` → score multiplied by 0.08 (hard demotion)
3. `cert_days_to_expiry < 30` → score −5 (soft warning)
4. Trains sorted by score descending → `rank` 1–30
5. NOT FIT trains (rank 27–30 today) are excluded from `buildAllTripsAI`

### Retraining

The model auto-retrains on startup if no saved model exists. To force a retrain after accumulating new delay logs:

```bash
curl -X POST http://localhost:8000/model/retrain \
     -H 'Content-Type: application/json' \
     -d '{"force": true}'
```

Or programmatically from JavaScript:

```js
await fetch('http://localhost:8000/model/retrain', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ force: true }),
});
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_AI_API_URL` | `http://localhost:8000` | Python backend URL (set in `.env.local`) |

---

## Production Notes

- **CORS**: Update `allow_origins` in `api/main.py` to restrict to your frontend domain
- **Model persistence**: `reliability_model.pkl` and `model_metrics.json` are written to `models/`; back these up
- **Historical data growth**: `historical_delays.csv` grows with every `POST /logs/delay`; retrain monthly
- **Scaling**: For high traffic, run multiple Uvicorn workers: `uvicorn api.main:app --workers 4`
