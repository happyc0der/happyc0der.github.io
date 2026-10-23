"""Browser harness for the portfolio demo. Written for the demo; NOT part of the repo.

Everything that simulates or scores lives in the repo's own files, copied unmodified
into ./py/ from happyc0der/multi_armed_bandit_algorithms at commit 2be15ab:

    bench.cases.get_case / build_algorithms   case definitions and algorithm factories
    bench.preflight.preflight                 feasibility checks, run before any simulation
    bench.runner.run_trial / _make_env        one seed of one case, SyntheticEnv per algorithm
    bench.metrics.summarize_run / dispersion  regret split, probe age, phase table
    bench.metrics.downsample_cumulative / _x  the curve reduction the repo's plots use

This file only picks a case, calls those functions, and turns their output into JSON
for the page to draw. The one thing it does that run_trial cannot is flip TS-GE's
documented `reproduce_paper_beta_typo` switch (ts_ge.py, deviation 1), which
build_algorithms has no case key for; that branch repeats run_trial's four calls.
"""
from __future__ import annotations

import json
import time

import numpy as np

from bench.cases import ALL_ALGORITHMS, build_algorithms, get_case
from bench.metrics import (
    PROBE_AGE_NA,
    dispersion,
    downsample_cumulative,
    downsample_x,
    summarize_run,
)
from bench.preflight import ERROR, preflight
from bench.runner import _make_env, run_trial

# The two cases a browser can run in seconds. case2-case4 (K up to 128, T up to 1e6)
# take minutes to hours natively and are not offered.
PRESETS = {
    "case1": "case1_K2_baseline",
    "case5": "case5_best_arm_collapse",
}


def _case(preset: str, ts_ge_delta: float | None = None) -> dict:
    case = get_case(PRESETS[preset])
    if ts_ge_delta is not None:
        case["ts_ge_delta"] = float(ts_ge_delta)
    return case


def _best_segments(case: dict) -> list[list[int]]:
    """[start, end, best_arm] pieces of the horizon, 1-indexed and inclusive.

    Derived from the case's own means and change_schedule, the same oracle that
    SyntheticEnv applies (a change at t takes effect on the query at t).
    """
    means = list(case["means"])
    segments, start = [], 1
    for t, arm, new_mean in sorted(case["change_schedule"], key=lambda c: c[0]):
        if t > start:
            segments.append([start, t - 1, int(np.argmax(means))])
        means[arm] = new_mean
        start = t
    segments.append([start, case["T"], int(np.argmax(means))])
    return segments


def describe(preset: str, ts_ge_delta: float | None = None) -> str:
    case = _case(preset, ts_ge_delta)
    findings = preflight(case)
    return json.dumps({
        "preset": preset,
        "name": case["name"],
        "K": case["K"],
        "T": case["T"],
        "means": [float(m) for m in case["means"]],
        "sigma": case["sigma"],
        "R_max": case["reward_R_max"],
        "ts_ge_delta": case["ts_ge_delta"],
        "change_schedule": [[int(t), int(a), float(m)] for t, a, m in case["change_schedule"]],
        "note": case.get("note", ""),
        "algorithms": list(ALL_ALGORITHMS),
        "best_segments": _best_segments(case),
        "preflight": [
            {"level": f.level, "check": f.check, "message": f.message} for f in findings
        ],
        "preflight_ok": not any(f.level == ERROR for f in findings),
    })


def _raster(chosen: list, K: int, T: int, columns: int) -> tuple[list[int], int]:
    """Share of each column's slots spent on each arm, plus a last row for group probes.

    Returned row-major as 0-255 integers, rows = arms 0..K-1 then 'probe'.
    """
    columns = min(columns, T)
    codes = np.fromiter(
        (a if isinstance(a, (int, np.integer)) else -1 for a in chosen),
        dtype=np.int64, count=len(chosen),
    )
    rows = np.where(codes >= 0, codes, K)
    col = (np.arange(len(codes)) * columns) // T
    counts = np.bincount(col * (K + 1) + rows, minlength=columns * (K + 1)).reshape(columns, K + 1)
    width = np.maximum(np.bincount(col, minlength=columns), 1)
    share = np.rint(255.0 * counts / width[:, None]).astype(np.int64)
    return share.T.reshape(-1).tolist(), columns


def _on_best_share(chosen: list, segments: list[list[int]]) -> float:
    best = np.empty(len(chosen), dtype=np.int64)
    for start, end, arm in segments:
        best[start - 1:end] = arm
    codes = np.fromiter(
        (a if isinstance(a, (int, np.integer)) else -1 for a in chosen),
        dtype=np.int64, count=len(chosen),
    )
    single = codes >= 0
    return float((codes[single] == best[single]).mean()) if single.any() else 0.0


def run_one(
    preset: str,
    name: str,
    seed: int,
    paper_beta_typo: bool = False,
    ts_ge_delta: float | None = None,
    points: int = 600,
    columns: int = 600,
) -> str:
    case = _case(preset, ts_ge_delta)
    K, T = case["K"], case["T"]

    if paper_beta_typo:
        if name != "TS-GE":
            raise ValueError("paper_beta_typo only applies to TS-GE")
        # run_trial has no hook for this flag, so repeat its four calls with it set.
        # The factory is the repo's own; TS_GE reads the flag only inside run().
        algorithm = build_algorithms(case, [name])[name](seed)
        algorithm.reproduce_paper_beta_typo = True
        env = _make_env(case, seed)
        started = time.time()
        history = algorithm.run(env.reward_fn)
        elapsed = time.time() - started
        regret, is_decision, metrics = summarize_run(history, env.best_mean_history, K, elapsed)
        if len(regret) != T:
            raise RuntimeError(f"{name} returned {len(regret)} reward slots, expected T={T}.")
        decision = np.where(is_decision, regret, 0.0)
    else:
        trial = run_trial(case, [name], seed, keep_histories=True)[name]
        history, regret, decision, metrics = (
            trial.history, trial.regret, trial.decision_regret, trial.metrics,
        )

    segments = _best_segments(case)
    first_change = case["change_schedule"][0][0] if case["change_schedule"] else 0
    post = [t for t in metrics.detections if t >= first_change]
    raster, raster_columns = _raster(history["chosen_arm"], K, T, columns)

    out = {
        "algorithm": name,
        "seed": seed,
        "paper_beta_typo": bool(paper_beta_typo),
        "ts_ge_delta": case["ts_ge_delta"],
        "x": downsample_x(T, points).tolist(),
        "total_curve": downsample_cumulative(regret, points).tolist(),
        "decision_curve": downsample_cumulative(decision, points).tolist(),
        "total_regret": metrics.total_regret,
        "decision_regret": metrics.decision_regret,
        "probe_regret": metrics.probe_regret,
        "decision_slots": metrics.decision_slots,
        "probe_slots": metrics.probe_slots,
        "max_probe_age": None if metrics.max_probe_age == PROBE_AGE_NA else metrics.max_probe_age,
        "detections": metrics.detections[:500],
        "n_detections": len(metrics.detections),
        "first_detection_after_change": post[0] if post else None,
        "latency": (post[0] - first_change) if post else None,
        "first_detection_reason": metrics.first_detection_reason(first_change),
        "phase_regret": metrics.phase_regret,
        "wall_time_s": metrics.wall_time_s,
        "on_best_share": _on_best_share(history["chosen_arm"], segments),
        "raster": raster,
        "raster_rows": K + 1,
        "raster_columns": raster_columns,
    }
    if name == "TS-GE":
        out["ts_ge"] = {key: history.get(key) for key in (
            "n_etc", "episode_length", "ts_length", "bp_length", "bp_threshold", "ge_threshold",
        )}
    return json.dumps(out)


# --- Reference numbers quoted from the repo's README.md at 2be15ab -------------------
# Only used to say whether a live result matches; never shown as if computed.

#: "Measured at K=2, T=6000, seed 42: TS-phase regret 21,860 literal against 174 corrected."
README_TS_PHASE = {"preset": "case1", "seed": 42, "corrected": 174, "as_printed": 21860}

#: "Regression reference": mean final total regret over seeds 1..20 on case1, to 6 decimals.
README_REGRESSION = {
    "FastAdSwitch": {"mean": 5625.766894, "std": 5519.042400, "min": 624.928830, "max": 23308.533084},
    "TS-GE": {"mean": 10162.864713, "std": 85.890860, "min": 10044.075167, "max": 10377.575524},
    "UCB1": {"mean": 30005.331795, "std": 34.946414, "min": 29942.241429, "max": 30077.091614},
    "EpsilonGreedy": {"mean": 13028.372858, "std": 1821.488515, "min": 10202.998534, "max": 18707.741346},
    "M-UCB": {"mean": 1914.944740, "std": 122.228658, "min": 1597.178292, "max": 2166.230515},
}
REGRESSION_PRESET, REGRESSION_SEEDS = "case1", list(range(1, 21))


#: The README's case1 phase table ("BP - mandatory probing ... 7,786 ... 75.9%", "TS ... 208")
#: is the sweep's detail seed, seeds[0] = 1.
README_PHASE_TABLE = {"preset": "case1", "seed": 1, "bp_share": 75.9, "ts_regret": 208}


def ts_phase_check(
    preset: str,
    seed: int,
    corrected: float | None,
    as_printed: float | None,
    bp_share: float | None = None,
) -> str:
    """Compare live TS-GE figures with the README's rounded ones, where they apply."""
    ref, table = README_TS_PHASE, README_PHASE_TABLE
    out = {"applies": preset == ref["preset"] and seed == ref["seed"], **ref,
           "table": {**table, "applies": preset == table["preset"] and seed == table["seed"]}}
    if out["applies"]:
        out["corrected_matches"] = None if corrected is None else round(corrected) == ref["corrected"]
        out["as_printed_matches"] = None if as_printed is None else round(as_printed) == ref["as_printed"]
    if out["table"]["applies"] and corrected is not None and bp_share is not None:
        out["table"]["matches"] = (
            round(bp_share, 1) == table["bp_share"] and round(corrected) == table["ts_regret"]
        )
    return json.dumps(out)


_regression: dict[str, list[float]] = {}


def regression_reset() -> None:
    _regression.clear()


def regression_seed(seed: int) -> str:
    """One seed of case1 through the repo's run_trial, every algorithm."""
    trial = run_trial(_case(REGRESSION_PRESET), list(ALL_ALGORITHMS), seed)
    for name, run in trial.items():
        _regression.setdefault(name, []).append(run.metrics.total_regret)
    return json.dumps({name: run.metrics.total_regret for name, run in trial.items()})


def regression_summary() -> str:
    """bench.metrics.dispersion over the seeds run so far, beside the README's row."""
    rows = {}
    for name, values in _regression.items():
        live = dispersion(values)
        ref = README_REGRESSION[name]
        rows[name] = {
            "n": len(values),
            "live": live,
            "readme": ref,
            # The README prints 6 decimals; a match means the live value prints the same.
            "matches": len(values) == len(REGRESSION_SEEDS)
            and all(f"{live[k]:.6f}" == f"{ref[k]:.6f}" for k in ("mean", "std", "min", "max")),
        }
    return json.dumps(rows)
