#!/bin/bash
# start.sh — One-command setup and launch for KMRL AI Scheduler
# Usage: bash start.sh

set -e

echo ""
echo "════════════════════════════════════════"
echo "   KMRL AI Train Scheduler — Startup"
echo "════════════════════════════════════════"

# 1. Install dependencies
echo ""
echo "▶  Installing Python dependencies…"
pip install -r requirements.txt -q

# 2. Generate historical data if not present
if [ ! -f "data/historical_delays.csv" ]; then
  echo ""
  echo "▶  Seeding historical data (first-time setup)…"
  python3 data/generate_historical.py
else
  echo "▶  Historical data already exists — skipping generation."
fi

# 3. Run tests
echo ""
echo "▶  Running tests…"
python3 tests/test_scheduler.py

# 4. Start server
echo ""
echo "▶  Starting FastAPI server on http://localhost:8000"
echo "   Interactive docs: http://localhost:8000/docs"
echo ""
uvicorn api.main:app --reload --port 8000
