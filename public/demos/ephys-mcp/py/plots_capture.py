"""Stand-in for ephys_mcp.plots, written for the in-browser demo (not part of ephys-mcp).

The real module draws PNGs with matplotlib. The demo does not download matplotlib (about 10 MB
more), so this module is installed as `ephys_mcp.plots` before server.py is imported. The
server's plot tools run unchanged and call these functions with the same arguments; each one
keeps the arrays it was given, plus the few derived values the real figure is built from
(trial subset, heatmap order and colour limit, unrecorded spans), and the page draws them as SVG.
"""

from __future__ import annotations

import itertools
import re

import numpy as np

CAPTURED: dict[str, dict] = {}
_counter = itertools.count(1)


def _r(a, nd=4):
    return np.round(np.asarray(a, dtype=float), nd).tolist()


def _keep(stem: str, kind: str, title: str, **data) -> str:
    safe = re.sub(r"[^A-Za-z0-9_-]+", "-", stem)
    path = f"/tmp/ephys-mcp-plots/{safe}-{next(_counter)}.svg"
    CAPTURED[path] = {"kind": kind, "title": title, **data}
    return path


def output_dir():
    return "/tmp/ephys-mcp-plots"


def plot_psth(stem, title, event, t, groups, unit_z, rate_label):
    unit_z = np.asarray(unit_z, dtype=float)
    heat = None
    if len(unit_z) > 1:  # same rule, order and colour limit as plots.plot_psth
        order = np.argsort(np.abs(unit_z).argmax(axis=1))
        lim = max(2.0, float(np.percentile(np.abs(unit_z), 99)))
        heat = {"z": _r(unit_z[order], 2), "units": order.tolist(), "lim": round(lim, 3)}
    return _keep(
        stem,
        "psth",
        title,
        event=event,
        t=_r(t),
        rate_label=rate_label,
        groups=[{"label": str(k), "mean": _r(m, 3), "sem": _r(s, 3), "n": int(n)} for k, (m, s, n) in groups.items()],
        heat=heat,
    )


def plot_raster(stem, title, spikes, t0, t1, valid):
    edges = np.concatenate([[t0], np.clip(valid, t0, t1).ravel(), [t1]]).reshape(-1, 2)
    gaps = [[float(a), float(b)] for a, b in edges if b > a]  # spans between recorded intervals
    return _keep(stem, "raster", title, t0=float(t0), t1=float(t1), spikes=[_r(s) for s in spikes], unrecorded=gaps)


def plot_decode(stem, title, t, true, decoded, unit, r2):
    t = np.asarray(t, dtype=float)
    gaps = (np.flatnonzero(np.diff(t) > 1.5 * np.median(np.diff(t))) + 1).tolist() if t.size > 1 else []
    return _keep(
        stem, "decode", title, t=_r(t), true=_r(true, 3), decoded=_r(decoded, 3), unit=unit, r2=_r(r2, 3), gaps=gaps
    )


def plot_latents(stem, title, t, traj, labels, variance, max_trials, variance_label="Variance explained (%)"):
    traj = np.asarray(traj, dtype=float)
    labels = np.asarray(labels)
    groups = sorted(set(labels.tolist()))
    rng = np.random.default_rng(0)  # the same trials plots.plot_latents would draw
    drawn = rng.choice(len(labels), size=min(max_trials, len(labels)), replace=False)
    n_show = min(3, traj.shape[2])
    means = {g: _r(traj[labels == g].mean(axis=0)[:, :n_show], 3) for g in groups}
    return _keep(
        stem,
        "latents",
        title,
        t=_r(t),
        groups=groups,
        means=means,
        trials=[{"label": str(labels[i]), "x": _r(traj[i, :, :n_show], 3)} for i in drawn],
        variance=_r(variance),
        variance_label=variance_label,
        zero=int(np.argmin(np.abs(np.asarray(t)))),
    )


def plot_probe(stem, title, pos, rates, areas, units):
    pos = np.asarray(pos, dtype=float)
    counts = None
    if units:
        counts = np.bincount(np.array([u[0] for u in units]), minlength=len(pos)).tolist()
    return _keep(stem, "probe", title, pos=_r(pos, 1), rates=_r(rates, 2), areas=areas, unit_counts=counts)
