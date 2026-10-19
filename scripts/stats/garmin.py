"""Daily Garmin numbers for the portfolio, read through the local garmin-connect-api session.

Run with: uv run --project ~/Projects/garmin-connect-api python scripts/stats/garmin.py [--days 2] [--since 2026-01-01]
Prints JSON: {"days": {date: {...}}, "activities": [...], "records": {...}, "body": {...}}.
Body composition comes from weigh-ins (Keshav's Hume Pod, once the Hume app syncs to Garmin); he approved publishing it.
Fetches only the days asked for, so the daily job stays well under Garmin's rate limits.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import date, timedelta

from garmin_api.services import activities, health, weight


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


# Garmin's own record-type ids (personalrecord-service/personalrecordtype/prtypes) for the ones published here.
POOL = {17: ("longest_pool_swim_m", None), 20: ("pool_400m_s", 400), 23: ("pool_1000m_s", 1000), 25: ("pool_1500m_s", 1500)}
RUN_RIDE = {7: "farthest_run_m", 8: "farthest_ride_m"}


def records() -> dict:
    """A few personal records. Pool times faster than 50 s per 100 m are treated as watch glitches and dropped."""
    out: dict = {}
    for r in health.personal_records() or []:
        t, v = r.get("typeId"), r.get("value")
        if v is None:
            continue
        when = (r.get("activityStartDateTimeLocalFormatted") or r.get("prStartTimeGmtFormatted") or "")[:10] or None
        if t in POOL:
            key, dist = POOL[t]
            if dist and v < dist / 100 * 50:
                continue
            out[key] = {"value": round(v, 1), "date": when}
        elif t in RUN_RIDE:
            out[RUN_RIDE[t]] = {"value": round(v), "date": when}
    return out


def body() -> dict | None:
    """Latest weigh-in with body composition, plus the weight change over about 30 days."""
    today = date.today()
    rows = [w for w in weight.weigh_ins(today - timedelta(120), today) if w.weight_kg]
    if not rows:
        return None
    rows.sort(key=lambda w: (w.day or today, w.timestamp or 0))
    last = rows[-1]
    month_ago = next((w for w in reversed(rows) if w.day and last.day and (last.day - w.day).days >= 25), None)
    return {
        "date": last.day.isoformat() if last.day else None,
        "weight_kg": last.weight_kg, "body_fat_pct": last.body_fat_pct, "muscle_mass_kg": last.muscle_mass_kg,
        "body_water_pct": last.body_water_pct, "bone_mass_kg": last.bone_mass_kg, "bmi": last.bmi, "source": last.source,
        "change_30d_kg": round(last.weight_kg - month_ago.weight_kg, 1) if month_ago else None,
        "weigh_ins_120d": len(rows),
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=2, help="days back from today, inclusive")
    ap.add_argument("--only", nargs="*", default=None, help="explicit YYYY-MM-DD days to fetch")
    ap.add_argument("--records", action="store_true", help="also fetch personal records (one call)")
    ap.add_argument("--body", action="store_true", help="also fetch the latest weigh-in / body composition (one call)")
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
    if a.records:
        out["records"] = records()
    if a.body:
        out["body"] = body()
    print(json.dumps(out))


if __name__ == "__main__":
    main()
