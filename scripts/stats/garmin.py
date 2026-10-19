"""Daily Garmin numbers for the portfolio, read through the local garmin-connect-api session.

Run with: uv run --project ~/Projects/garmin-connect-api python scripts/stats/garmin.py [--days 2] [--since 2026-01-01]
Prints JSON: {"days": {date: {...}}, "activities": [...]}. Weight and body composition are left out on purpose.
Fetches only the days asked for, so the daily job stays well under Garmin's rate limits.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import date, timedelta

from garmin_api.services import activities, health


def day_numbers(d: date) -> dict:
    s = health.day(d)
    sleep = s.sleep
    return {
        "steps": s.steps,
        "distance_m": s.distance_m,
        "floors": s.floors_climbed,
        "active_kcal": s.active_calories,
        "intensity_min": (s.moderate_intensity_minutes or 0) + 2 * (s.vigorous_intensity_minutes or 0)
        if s.moderate_intensity_minutes is not None or s.vigorous_intensity_minutes is not None else None,
        "resting_hr": s.resting_hr,
        "stress": s.average_stress,
        "body_battery_high": s.body_battery_high,
        "hrv": s.hrv_last_night_avg,
        "hrv_status": s.hrv_status,
        "readiness": s.training_readiness,
        "sleep_s": sleep.total_sleep_s if sleep else None,
        "sleep_score": sleep.sleep_score if sleep else None,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=2, help="days back from today, inclusive")
    ap.add_argument("--only", nargs="*", default=None, help="explicit YYYY-MM-DD days to fetch")
    ap.add_argument("--since", default=None, help="list activities from this date (default: 1 January this year); 'none' to skip")
    a = ap.parse_args()

    today = date.today()
    wanted = [date.fromisoformat(x) for x in a.only] if a.only else [today - timedelta(i) for i in range(a.days)]
    out: dict = {"days": {}, "activities": []}
    for d in wanted:
        try:
            out["days"][d.isoformat()] = day_numbers(d)
        except Exception as e:  # one bad day should not lose the rest
            print(f"garmin: {d}: {e}", file=sys.stderr)
        time.sleep(1.0)

    if a.since != "none":
        since = date.fromisoformat(a.since) if a.since else date(today.year, 1, 1)
        rows = activities.list_activities(start_date=since, end_date=today, limit=500)
        for r in rows:
            out["activities"].append({
                "date": (r.start_time_local or r.start_time).date().isoformat() if (r.start_time_local or r.start_time) else None,
                "type": r.activity_type.type_key if r.activity_type else None,
                "duration_s": r.duration_s,
                "distance_m": r.distance_m,
                "calories": r.calories,
            })
    print(json.dumps(out))


if __name__ == "__main__":
    main()
