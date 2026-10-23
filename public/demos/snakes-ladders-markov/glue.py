"""Glue between the demo page and the repo's code. Written for this page; not part of the repo.

Every number the page shows comes from a call into the repo's model.py or simulation.py,
made here. This file only converts NumPy results into plain lists and dicts for JavaScript,
and keeps one transition matrix per die size so the page does not rebuild it on every call.
"""

import math
import sys
import time
import types


def _stub_matplotlib():
    """Stand in for matplotlib, which this page never draws with.

    model.py and simulation.py import matplotlib.pyplot at the top but only call it inside
    main() and sharing_distribution(), which the page does not run; test_model.py calls
    matplotlib.use("Agg"). A module whose every attribute is a do-nothing function satisfies
    all three, and saves downloading matplotlib. The page draws its charts in JavaScript.
    """

    def nothing(*args, **kwargs):
        return None

    mpl = types.ModuleType("matplotlib")
    plt = types.ModuleType("matplotlib.pyplot")
    mpl.__getattr__ = lambda name: nothing
    plt.__getattr__ = lambda name: nothing
    mpl.pyplot = plt
    sys.modules["matplotlib"] = mpl
    sys.modules["matplotlib.pyplot"] = plt


_stub_matplotlib()

import numpy as np  # noqa: E402

import model  # noqa: E402
import simulation  # noqa: E402

_matrices = {}


def _matrix(roll):
    if roll not in _matrices:
        _matrices[roll] = model.transition_matrix(roll)
    return _matrices[roll]


def _ms(t0):
    return round((time.perf_counter() - t0) * 1000, 1)


def info():
    """The board and the constants the page needs, read from the modules."""
    return {
        "board": [[int(k), int(v)] for k, v in model.game_board.items()],
        "n_squares": model.N_SQUARES,
        "win": model.WIN,
        "default_roll": model.DEFAULT_ROLL_HIGH,
        "max_turns": model.MAX_TURNS,
        "steps": model.COMPLETION_STEPS,
        "seed": model.SEED,
        "num_games": simulation.NUM_GAMES,
        "python": sys.version.split()[0],
        "numpy": np.__version__,
    }


def sweep(rolls):
    """model.expected_turns(model.transition_matrix(r)) from square 0, for each die size r."""
    t0 = time.perf_counter()
    out = []
    for r in rolls:
        try:
            out.append(float(model.expected_turns(_matrix(r))))
        except ValueError:
            out.append(None)
    return {"rolls": list(rolls), "expected": out, "ms": _ms(t0)}


def analyse(roll):
    """Everything the board and the tiles show for one die size."""
    t0 = time.perf_counter()
    T = _matrix(roll)
    reachable = [int(s) for s in model.reachable_squares(T)]
    try:
        expected, error = float(model.expected_turns(T)), None
    except ValueError as exc:
        expected, error = None, f"ValueError: {exc}"

    # Expected turns left from every square a turn can end on: one expected_turns(T, s) call
    # each. Snake and ladder heads are skipped, since no turn ever ends on one. When the call
    # raises, or returns something that is not a number, the page says so for that square.
    per_square, per_square_error = [], []
    for s in range(model.N_SQUARES):
        if s in model.game_board:
            per_square.append(None)
            per_square_error.append(None)
            continue
        try:
            value = float(model.expected_turns(T, s))
        except (ValueError, np.linalg.LinAlgError) as exc:
            per_square.append(None)
            per_square_error.append(f"{type(exc).__name__}: {exc}")
            continue
        # A singular I - Q (only the one-sided die) makes NumPy in Pyodide return nan where
        # desktop NumPy raises LinAlgError; report either as what the call did.
        if math.isfinite(value):
            per_square.append(value)
            per_square_error.append(None)
        else:
            per_square.append(None)
            per_square_error.append(f"returned {value}")

    curve = [float(v) for v in model.completion_curve(roll)]
    rows_sum_to_one = bool(np.allclose(T.sum(axis=1), 1.0))
    return {
        "roll": roll,
        "reachable": reachable,
        "expected": expected,
        "error": error,
        "per_square": per_square,
        "per_square_error": per_square_error,
        "curve": curve,
        "rows_sum_to_one": rows_sum_to_one,
        "stay_99": float(T[99, 99]),
        "ms": _ms(t0),
    }


def distribution(roll, n):
    """model.sharing_distribution_plot(T, n): where the player is after n turns."""
    t0 = time.perf_counter()
    d = model.sharing_distribution_plot(_matrix(roll), n)
    return {"roll": roll, "n": n, "p": d.tolist(), "ms": _ms(t0)}


def row(roll, square):
    """The nonzero entries of row `square` of model.transition_matrix(roll)."""
    T = _matrix(roll)
    return [[int(j), float(T[square, j])] for j in np.nonzero(T[square])[0]]


def point_walk(roll, turns):
    """The most likely square after each of turns 0..turns, from sharing_distribution_plot.

    The page asks for this only for a one-sided die, whose chain is deterministic, so the
    most likely square is the only square the player can be on.
    """
    T = _matrix(roll)
    return [int(np.argmax(model.sharing_distribution_plot(T, n))) for n in range(turns + 1)]


def settles(roll, epsilon):
    """model.first_limiting_power(T, epsilon), or None if not within its 600-power search."""
    t0 = time.perf_counter()
    n = model.first_limiting_power(_matrix(roll), epsilon)
    return {"roll": roll, "epsilon": epsilon, "n": None if n is None else int(n), "ms": _ms(t0)}


def play(roll, seed):
    """One game sampled from the chain by model.simulate_game, after np.random.seed(seed)."""
    t0 = time.perf_counter()
    np.random.seed(seed)
    try:
        path = [int(s) for s in model.simulate_game(_matrix(roll))]
    except RuntimeError as exc:
        return {"roll": roll, "seed": seed, "path": None, "error": f"RuntimeError: {exc}", "ms": _ms(t0)}
    return {"roll": roll, "seed": seed, "path": path, "error": None, "ms": _ms(t0)}


def empirical(games, seed):
    """simulation.py's brute-force check: roll real dice, tally transitions, compare.

    The loop and the comparison follow simulation.main(): seed, play `games` games with
    simulation.simulate_game, row-normalise with simulation.empirical_matrix, and find the
    largest disagreement with model.transition_matrix() on the rows observed at least once.
    simulation.py always rolls a six-sided die (roll_die's default).
    """
    t0 = time.perf_counter()
    np.random.seed(seed)
    counts = np.zeros((model.N_SQUARES, model.N_SQUARES), dtype=np.int64)
    turns = [len(simulation.simulate_game(counts)) for _ in range(games)]
    simulated = simulation.empirical_matrix(counts)
    analytic = model.transition_matrix()
    visited_rows = [i for i in range(model.N_SQUARES) if counts[i].sum() > 0]
    gaps = {i: float(np.max(np.abs(simulated[i] - analytic[i]))) for i in visited_rows}
    worst_row = max(gaps, key=gaps.get)

    rows = {}
    for i in range(model.N_SQUARES):
        cols = sorted(set(np.nonzero(analytic[i])[0].tolist()) | set(np.nonzero(counts[i])[0].tolist()))
        rows[i] = {
            "observed": int(counts[i].sum()),
            "cells": [[int(j), float(analytic[i, j]), float(simulated[i, j]), int(counts[i, j])] for j in cols],
        }
    return {
        "games": games,
        "seed": seed,
        "mean": float(np.mean(turns)),
        "exact": float(model.expected_turns(analytic)),
        "rows_observed": len(visited_rows),
        "worst": gaps[worst_row],
        "worst_row": int(worst_row),
        "rows": rows,
        "ms": _ms(t0),
    }


def run_tests(path):
    """The repo's test file under pytest, as `pytest -v` would run it."""
    import pytest

    t0 = time.perf_counter()
    code = pytest.main([path, "-v", "-p", "no:cacheprovider", "-o", "console_output_style=classic", "--color=no"])
    return {"code": int(code), "ms": _ms(t0)}
