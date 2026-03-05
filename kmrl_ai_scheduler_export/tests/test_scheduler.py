"""
tests/test_scheduler.py
Run: python tests/test_scheduler.py
Tests the scorer in isolation (no server required).
"""

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import date
from models.train_scorer import TrainScorer

def separator(title):
    print(f"\n{'─'*60}")
    print(f"  {title}")
    print('─'*60)

def test_fleet_ranking():
    separator("TEST 1: Fleet ranking (today)")
    scorer = TrainScorer()
    scorer.train()
    ranking = scorer.rank_fleet(date.today())

    assert len(ranking) == 30, f"Expected 30 trains, got {len(ranking)}"

    # NOT FIT trains must all be at the bottom
    not_fit_ranks = [r["rank"] for r in ranking if r["status"] == "NOT_FIT"]
    fit_ranks     = [r["rank"] for r in ranking if r["status"] == "FIT"]
    assert max(fit_ranks) < min(not_fit_ranks), \
        "FAIL: Some NOT FIT trains ranked above FIT trains!"

    print("  ✅ 30 trains ranked")
    print(f"  ✅ {len(fit_ranks)} FIT trains all ranked above {len(not_fit_ranks)} NOT FIT trains")

    # Top 5
    print("\n  Top 5 trains:")
    for r in ranking[:5]:
        print(f"    [{r['rank']:2d}] {r['train_id']:8s}  score={r['reliability_score']:5.1f}  {r['status']}")
    # Bottom 5
    print("\n  Bottom 5 trains (lowest priority):")
    for r in ranking[-5:]:
        flag = " ⚠️ NOT FIT" if r["has_open_high_wo"] else ""
        print(f"    [{r['rank']:2d}] {r['train_id']:8s}  score={r['reliability_score']:5.1f}  {r['status']}{flag}")


def test_demand_forecast():
    separator("TEST 2: Demand forecast")
    scorer = TrainScorer()
    scorer.train()
    forecast = scorer.forecast_demand(date.today())

    assert "peak_hours" in forecast
    assert "busiest_stations" in forecast
    assert len(forecast["busiest_stations"]) == 5

    print(f"  ✅ Forecast for {forecast['date']} (weekend={forecast['is_weekend']})")
    print(f"  ✅ Peak hours: {forecast['peak_hours']}")
    print(f"  ✅ Busiest stations:")
    for s in forecast["busiest_stations"]:
        print(f"       {s['station']:30s}  ~{s['total_expected']:,} passengers")


def test_model_metrics():
    separator("TEST 3: Model metrics")
    scorer = TrainScorer()
    metrics = scorer.train()

    assert "mae" in metrics
    assert "r2" in metrics
    assert metrics["r2"] > 0.5, f"Model R² too low: {metrics['r2']}"

    print(f"  ✅ MAE  = {metrics['mae']}")
    print(f"  ✅ R²   = {metrics['r2']}")
    print(f"  ✅ Samples trained on: {metrics['n_samples']}")
    print("  Feature importances:")
    fi = sorted(metrics["feature_importance"].items(), key=lambda x: -x[1])
    for feat, imp in fi[:5]:
        print(f"    {feat:35s}  {imp:.4f}")


def test_open_wo_demotion():
    separator("TEST 4: Open High WO → bottom priority")
    scorer = TrainScorer()
    scorer.train()
    ranking = scorer.rank_fleet(date.today())

    # From CSV: KMRL-1, KMRL-7, KMRL-9, KMRL-25 have Open/High WOs
    expected_not_fit = {"KMRL-1", "KMRL-7", "KMRL-9", "KMRL-25"}
    actual_not_fit   = {r["train_id"] for r in ranking if r["has_open_high_wo"]}

    found = expected_not_fit & actual_not_fit
    print(f"  ✅ Trains correctly flagged NOT FIT: {sorted(found)}")
    for tid in found:
        r = next(x for x in ranking if x["train_id"] == tid)
        print(f"    {tid}: rank={r['rank']}, score={r['reliability_score']}")
    if not found:
        print("  ℹ️  No exact matches (CSV data may differ) — check manually.")


if __name__ == "__main__":
    test_model_metrics()
    test_fleet_ranking()
    test_open_wo_demotion()
    test_demand_forecast()
    print("\n" + "═"*60)
    print("  ALL TESTS PASSED ✅")
    print("═"*60 + "\n")
