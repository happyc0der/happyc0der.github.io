"""Export the lfp2vec-audit repo's saved results into data.json for the portfolio demo.

Usage:
    python3 -I export_data.py <path to a clone of happyc0der/lfp2vec-audit> <output data.json>

Standard library only. Nothing is re-trained or re-run: every value in data.json is copied from
a committed result file (results/spectra, results/postprocess, results/calibration,
results/finetune_v2) or computed from one the way the repo computes it, and the script fails if
those values disagree with the tables the repo publishes (README.md, docs/RESULTS_FIXES.md,
docs/RESULTS_CALIBRATION.md, docs/DEVIATIONS.md).
"""

from __future__ import annotations

import ast
import bisect
import csv
import json
import math
import re
import statistics
import subprocess
import sys
from pathlib import Path

DIRECTIONS = {
    "cross_lab_ibl_to_allen": {"train": "IBL", "test": "Allen"},
    "cross_lab_allen_to_ibl": {"train": "Allen", "test": "IBL"},
}
SEEDS = (0, 1, 2)
STAGES = ("raw", "temporal", "spatial")
# Fine-tunes whose per-channel predictions the Probes tab draws (whitening is in Transfer only).
SHOWN = ("finetune", "finetune__lp100")
# Configurations as the repo's fixes table names them (lfpaudit/cli.py, fixes-report).
CONFIGS = {
    "finetune": "fine-tuned, full band",
    "finetune__lp100": "fine-tuned, filters matched (≤100 Hz)",
    "finetune__whiten": "fine-tuned, per-probe whitening",
    "baseline_w2v2_frozen_lp100": "untrained checkpoint + linear head, filters matched",
    "baseline_bandpower_full": "band power (control)",
    "baseline_position": "electrode position (control)",
}


def fail(message: str) -> None:
    sys.exit(f"export_data.py: {message}")


def check(condition: bool, message: str) -> None:
    if not condition:
        fail(message)


def read_csv(path: Path) -> list[dict]:
    with path.open(newline="") as handle:
        return list(csv.DictReader(handle))


def finite(value: float) -> float | None:
    return None if value is None or (isinstance(value, float) and math.isnan(value)) else value


def interp(xs: list[float], ys: list[float], x: float) -> float:
    """np.interp for increasing xs, which is what scripts/make_figures.py uses."""
    if x <= xs[0]:
        return ys[0]
    if x >= xs[-1]:
        return ys[-1]
    i = bisect.bisect_right(xs, x)
    x0, x1 = xs[i - 1], xs[i]
    return ys[i - 1] + (ys[i] - ys[i - 1]) * (x - x0) / (x1 - x0)


def regions(repo: Path) -> list[str]:
    tree = ast.parse((repo / "lfpaudit/__init__.py").read_text())
    for node in tree.body:
        if isinstance(node, ast.AnnAssign) and getattr(node.target, "id", "") == "REGIONS":
            return list(ast.literal_eval(node.value))
    fail("REGIONS not found in lfpaudit/__init__.py")
    return []


def four_class_view(repo: Path) -> list[str]:
    """The classes of the repo's "4class" view (CLASS_VIEWS in lfpaudit/eval/runner.py)."""
    tree = ast.parse((repo / "lfpaudit/eval/runner.py").read_text())
    for node in tree.body:
        if isinstance(node, ast.AnnAssign) and getattr(node.target, "id", "") == "CLASS_VIEWS":
            for key, value in zip(node.value.keys, node.value.values):
                if isinstance(key, ast.Constant) and key.value == "4class":
                    return list(ast.literal_eval(value))
    fail("CLASS_VIEWS['4class'] not found in lfpaudit/eval/runner.py")
    return []


def data_card(repo: Path, classes: list[str]) -> dict:
    """Channels kept per probe and per region, and chunks per region, from docs/DATA_CARD.md."""
    text = (repo / "docs/DATA_CARD.md").read_text()
    stores = {}
    for name in ("ibl", "allen"):
        check(f"### `{name}`" in text, f"DATA_CARD.md has no section for {name}")
        section = text.split(f"### `{name}`", 1)[1].split("\n### ", 1)[0]
        lines = section.splitlines()
        header = next((ln for ln in lines if ln.startswith("| group |")), None)
        check(header is not None, f"DATA_CARD.md {name}: no table")
        cols = [c.strip() for c in header.strip("|").split("|")]
        check(cols[1] == "channels kept" and cols[2 : 2 + len(classes)] == classes,
              f"DATA_CARD.md {name}: unexpected columns {cols}")
        groups = {}
        for ln in lines:
            if not ln.startswith("| ") or ln == header:
                continue
            cells = [c.strip() for c in ln.strip("|").split("|")]
            groups[cells[0]] = {"kept": int(cells[1]), **{c: int(cells[2 + i]) for i, c in enumerate(classes)}}
        found = re.search(r"Chunks per region: ([\d /]+)\.", section)
        check(found is not None, f"DATA_CARD.md {name}: no chunks-per-region line")
        per_region = [int(v) for v in found.group(1).split(" / ")]
        check(len(per_region) == len(classes), f"DATA_CARD.md {name}: chunks per region")
        stores[name] = {"groups": groups, "region_chunks": dict(zip(classes, per_region))}
    return stores


def spectra(repo: Path) -> dict:
    rows = read_csv(repo / "results/spectra/mean_psd.csv")
    labs: dict[str, list[tuple[float, float]]] = {}
    for row in rows:
        labs.setdefault(row["dataset"], []).append((float(row["freq_hz"]), float(row["psd"])))
    check(set(labs) == {"ibl", "allen"}, f"unexpected datasets {sorted(labs)}")
    series = {}
    for name, points in labs.items():
        points.sort()
        series[name] = {"f": [p[0] for p in points], "psd": [p[1] for p in points]}

    def at(name: str, hz: float) -> float:
        return interp(series[name]["f"], series[name]["psd"], hz)

    # DEVIATIONS D11: "mean power spectra normalised to each store's own value at 10 Hz".
    ref = 10.0

    def ratio(hz: float) -> float:
        return (at("allen", hz) / at("allen", ref)) / (at("ibl", hz) / at("ibl", ref))

    # D11's published table, read from the file rather than typed in.
    text = (repo / "docs/DEVIATIONS.md").read_text()
    section = text.split("## D11", 1)[1].split("\n## ", 1)[0]
    d11 = {int(hz): float(x) for hz, x in re.findall(r"\|\s*(\d+) Hz\s*\|\s*([\d.]+)x\s*\|", section)}
    check(sorted(d11) == [100, 200, 300, 500], f"D11 table not as expected: {d11}")
    checkpoints = []
    for hz, published in sorted(d11.items()):
        measured = ratio(hz)
        # The committed mean_psd.csv is a 4 000-chunk subsample (README, spectra caption), so it
        # need not reproduce D11 to the digit. Fail if it is not the same measurement at all.
        check(
            abs(measured / published - 1) < 0.10,
            f"{hz} Hz: ratio {measured:.3f} from mean_psd.csv is not within 10% of D11's {published}",
        )
        checkpoints.append({"hz": hz, "from_csv": measured, "d11": published})
    # Ratio at every IBL bin from 1 Hz up, for the strongest point the readout can land on.
    best = max(
        ((ratio(f), f) for f in series["ibl"]["f"] if f >= 1.0),
        key=lambda pair: pair[0],
    )
    return {
        "file": "results/spectra/mean_psd.csv",
        "method_file": "docs/DEVIATIONS.md",
        "figure_code": "scripts/make_figures.py",
        "ref_hz": ref,
        "ibl": series["ibl"],
        "allen": series["allen"],
        "checkpoints": checkpoints,
        "max_ratio": {"hz": best[1], "ratio": best[0]},
    }


def postprocess(repo: Path) -> tuple[list[dict], dict]:
    """Every run's metrics per stage at chunk and channel level, as written by the repo."""
    folder = repo / "results/postprocess"
    runs = []
    by_run = {}
    for path in sorted(folder.glob("*.csv")):
        if path.stem.endswith("__channels"):
            continue
        tag = path.stem
        stages: dict[str, dict] = {}
        for row in read_csv(path):
            check(row["run"] == tag, f"{path.name}: run column {row['run']}")
            stages.setdefault(row["stage"], {})[row["level"]] = {
                "raw_accuracy": float(row["raw_accuracy"]),
                "balanced_accuracy": float(row["balanced_accuracy"]),
                "chance": float(row["chance"]),
                "majority": float(row["majority"]),
                "n": int(row["n"]),
            }
        entry = {"run": tag, "file": f"results/postprocess/{path.name}", "stages": stages}
        if tag.startswith("loso_ibl__"):
            entry["kind"] = "loso"
            entry["session"] = tag.split("__")[1]
        else:
            scheme = next((s for s in DIRECTIONS if tag.startswith(s + "__")), None)
            check(scheme is not None, f"unknown run {tag}")
            tail = tag[len(scheme) + 2 :]
            seed = re.search(r"seed(\d+)", tail)
            config = re.sub(r"all_target_groups__seed\d+", "finetune", tail)
            check(config in CONFIGS, f"unknown configuration {config} in {tag}")
            entry.update(
                kind="cross_lab",
                direction=scheme,
                config=config,
                seed=int(seed.group(1)) if seed else None,
            )
        runs.append(entry)
        by_run[tag] = entry
    return runs, by_run


def check_against_fixes_table(repo: Path, runs: list[dict]) -> dict:
    """Recompute the fixes table's mean ± sd the way lfpaudit/cli.py does and compare."""
    text = (repo / "docs/RESULTS_FIXES.md").read_text()
    published = {}
    for scheme, label in (("cross_lab_ibl_to_allen", "IBL → Allen"), ("cross_lab_allen_to_ibl", "Allen → IBL")):
        section = text.split(f"## {label}", 1)[1].split("\n## ", 1)[0]
        found = re.search(
            r"raw ([\d.]+) against majority ([\d.]+), \*\*margin ([+-][\d.]+)\*\*", section
        )
        check(found is not None, f"published margin not found for {label}")
        raw, majority, margin = (float(v) for v in found.groups())
        published[scheme] = {"raw": raw, "majority": majority, "margin": margin}
        for config, name in CONFIGS.items():
            for stage in STAGES:
                picked = [
                    r for r in runs
                    if r.get("direction") == scheme and r.get("config") == config and stage in r["stages"]
                ]
                if not picked:
                    continue
                rows = [r["stages"][stage]["chunk"] for r in picked]
                margins = [x["raw_accuracy"] - x["majority"] for x in rows]
                cell = format(statistics.mean(margins), "+.3f")
                if len(margins) > 1:
                    cell += f" ± {statistics.stdev(margins):.3f}"
                prefix = name + (f" (n={len(picked)} seeds)" if config.startswith("finetune") else "")
                line = next(
                    (ln for ln in section.splitlines() if ln.startswith(f"| {prefix} | {stage} |")),
                    None,
                )
                check(line is not None, f"no fixes-table row for {label} / {prefix} / {stage}")
                cells = [c.strip() for c in line.strip("|").split("|")]
                check(cells[3] == cell, f"{label} {prefix} {stage}: table says {cells[3]}, files give {cell}")
    return published


def check_channel_tables(direction_runs: dict, by_run: dict, n_classes: int) -> None:
    """Channel-level scores recomputed from the channel tables must equal the CSV rows."""
    for scheme, info in direction_runs.items():
        truth = info["label"]
        for tag, preds in info["runs"].items():
            for stage in ("temporal", "spatial"):
                predicted = preds[stage]
                present = sorted(set(truth))
                recalls = []
                for c in present:
                    idx = [i for i, t in enumerate(truth) if t == c]
                    recalls.append(sum(predicted[i] == c for i in idx) / len(idx))
                balanced = sum(recalls) / len(recalls)
                raw = sum(p == t for p, t in zip(predicted, truth)) / len(truth)
                row = by_run[tag]["stages"][stage]["channel"]
                check(abs(row["balanced_accuracy"] - balanced) < 1e-9, f"{tag} {stage}: balanced mismatch")
                check(abs(row["raw_accuracy"] - raw) < 1e-9, f"{tag} {stage}: raw mismatch")
                check(row["n"] == len(truth), f"{tag} {stage}: n mismatch")
                check(all(0 <= p < n_classes for p in predicted), f"{tag}: class out of range")


def probes(repo: Path, by_run: dict, classes: list[str], view: list[str], card: dict) -> dict:
    folder = repo / "results/postprocess"
    out = {}
    dropped = [c for c in classes if c not in view]
    for scheme, labs in DIRECTIONS.items():
        tags = sorted(
            t for t, r in by_run.items()
            if r.get("direction") == scheme and r["config"] in SHOWN
        )
        keys = None
        info: dict = {"train": labs["train"], "test": labs["test"], "runs": {}}
        for tag in tags:
            rows = read_csv(folder / f"{tag}__channels.csv")
            these = [r["key"] for r in rows]
            if keys is None:
                keys = these
                groups: list[dict] = []
                for r in rows:
                    if not groups or groups[-1]["id"] != r["group"]:
                        groups.append({"id": r["group"], "channel": [], "depth_um": []})
                    groups[-1]["channel"].append(int(r["channel"]))
                    depth = float(r["depth_um"])
                    groups[-1]["depth_um"].append(int(depth) if depth.is_integer() else depth)
                ids = [g["id"] for g in groups]
                check(len(ids) == len(set(ids)), f"{tag}: a group appears in two runs of rows")
                offset = 0
                for g in groups:
                    g["start"] = offset
                    offset += len(g["channel"])
                info["groups"] = groups
                # The channel tables use the repo's four-class view. Every channel the data card
                # keeps for the test lab must be here except those of the classes that view drops.
                store = card[labs["test"].lower()]
                check(set(ids) == set(store["groups"]), f"{tag}: probes differ from DATA_CARD.md")
                for g in groups:
                    row = store["groups"][g["id"]]
                    expected = row["kept"] - sum(row[c] for c in dropped)
                    check(len(g["channel"]) == expected,
                          f"{tag} {g['id']}: {len(g['channel'])} channels, DATA_CARD.md gives {expected}")
                info["excluded"] = {
                    "classes": dropped,
                    "channels": sum(row[c] for row in store["groups"].values() for c in dropped),
                    "chunks": sum(store["region_chunks"][c] for c in dropped),
                    "file": "docs/DATA_CARD.md",
                }
                info["label"] = [int(r["label"]) for r in rows]
                info["file_pattern"] = f"results/postprocess/{scheme}__all_target_groups__seed<N>[__lp100]__channels.csv"
            else:
                check(these == keys, f"{tag}: channel order differs from the first run")
                check([int(r["label"]) for r in rows] == info["label"], f"{tag}: labels differ")
            info["runs"][tag] = {
                "temporal": [int(r["temporal"]) for r in rows],
                "spatial": [int(r["spatial"]) for r in rows],
                "file": f"results/postprocess/{tag}__channels.csv",
            }
        out[scheme] = info
    check_channel_tables(out, by_run, len(classes))
    # The four-class view leaves CA2 out before scoring (Allen has 4 CA2 channels, IBL none), so
    # no row of a channel table is labelled CA2; none may be predicted CA2 either, since the page
    # gives the dropped classes no colour.
    for c in dropped:
        k = classes.index(c)
        for scheme, info in out.items():
            check(k not in info["label"], f"{scheme}: a channel is labelled {c}")
            for tag, preds in info["runs"].items():
                check(k not in preds["temporal"] and k not in preds["spatial"], f"{tag}: {c} predicted")
    # Compact the per-channel class lists into digit strings for size; app.js reads them by index.
    for info in out.values():
        info["label"] = "".join(map(str, info["label"]))
        for preds in info["runs"].values():
            preds["temporal"] = "".join(map(str, preds["temporal"]))
            preds["spatial"] = "".join(map(str, preds["spatial"]))
    return out


def chunk_predictions(repo: Path, by_run: dict, classes: list[str], probe_info: dict) -> dict:
    """Share of test chunks per predicted class, before post-processing, from metrics.json.

    The four-class view, as on the rest of the page. `n_chunks_all` is the five-class count, every
    test chunk, which is what the calibration files score."""
    out = {}
    for tag, entry in by_run.items():
        if entry.get("kind") != "cross_lab" or entry["config"] not in SHOWN:
            continue
        found = sorted((repo / "results/finetune_v2" / tag).glob("*/metrics.json"))
        if not found:
            continue
        path = found[-1]
        views = json.loads(path.read_text())["metrics"]
        metrics, every = views["4class"], views["5class"]
        check(metrics["class_names"] == classes, f"{path}: class names differ from REGIONS")
        confusion = metrics["confusion"]  # rows are the true class, columns the prediction
        total = sum(map(sum, confusion))
        check(total == metrics["n_samples"], f"{path}: confusion does not sum to n_samples")
        excluded = probe_info[entry["direction"]]["excluded"]
        left_out = sum(sum(every["confusion"][classes.index(c)]) for c in excluded["classes"])
        check(every["n_samples"] - total == left_out == excluded["chunks"],
              f"{path}: 5class minus 4class is {every['n_samples'] - total} chunks, "
              f"DATA_CARD.md gives {excluded['chunks']} for {excluded['classes']}")
        columns = [sum(row[j] for row in confusion) for j in range(len(classes))]
        out[tag] = {
            "file": str(path.relative_to(repo)),
            "n_chunks": total,
            "n_chunks_all": every["n_samples"],
            "predicted": columns,
            "accuracy": metrics["accuracy"],
            "balanced_accuracy": metrics["balanced_accuracy"],
            "lab_identity_auc": json.loads(path.read_text()).get("lab_identity_auc"),
        }
    return out


def calibration(repo: Path) -> dict:
    out = {}
    for path in sorted((repo / "results/calibration").glob("*.json")):
        raw = json.loads(path.read_text())  # Python's json reads the NaN bins the repo writes
        tag = raw["run"]
        check(tag == path.stem, f"{path.name}: run field {tag}")
        entry = {
            "file": f"results/calibration/{path.name}",
            "temperature_in_lab": raw["temperature_in_lab"],
            "temperature_oracle": raw["temperature_oracle"],
        }
        for split in ("in_lab", "cross_lab", "cross_lab_oracle"):
            part = raw[split]
            block = {k: part[k] for k in (
                "n_samples", "temperature", "ece_before", "ece_after", "accuracy",
                "mean_confidence_before", "mean_confidence_after",
            )}
            for when in ("before", "after"):
                rel = part[f"reliability_{when}"]
                block[f"reliability_{when}"] = {
                    "lower": rel["bin_lower"],
                    "upper": rel["bin_upper"],
                    "confidence": [finite(v) for v in rel["confidence"]],
                    "accuracy": [finite(v) for v in rel["accuracy"]],
                    "count": [int(v) for v in rel["count"]],
                }
                check(sum(block[f"reliability_{when}"]["count"]) == part["n_samples"], f"{path.name}: bins")
            entry[split] = block
        out[tag] = entry
    return out


def check_readme(repo: Path, runs: list[dict], calib: dict) -> dict:
    """The headline numbers the README states, recomputed from the files and compared."""
    readme = (repo / "README.md").read_text()
    loso = [r for r in runs if r["kind"] == "loso"]
    check(len(loso) == 7, f"expected 7 within-IBL sessions, found {len(loso)}")
    raw = [r["stages"]["raw"]["chunk"]["balanced_accuracy"] for r in loso]
    spatial = [r["stages"]["spatial"]["chunk"]["balanced_accuracy"] for r in loso]
    claim = f"{statistics.mean(raw):.2f} ± {statistics.stdev(raw):.2f}"
    check(f"**{claim}** (7 sessions)" in readme, f"README within-IBL claim differs from files: {claim}")
    check(f"| fine-tuned + the paper's post-processing | {statistics.mean(spatial):.2f} |" in readme,
          "README post-processed within-IBL number differs from files")
    found = re.search(r"\| LFP2Vec as published \*\(read from Figure 2a\)\* \| ([\d.]+) \| ([\d.]+) \|", readme)
    check(found is not None, "published within-lab row not found in README")
    for tag, name in (
        ("cross_lab_ibl_to_allen__all_target_groups__seed0", "full band, IBL → Allen"),
        ("cross_lab_allen_to_ibl__all_target_groups__seed0", "full band, Allen → IBL"),
        ("cross_lab_ibl_to_allen__all_target_groups__seed0__lp100", "harmonised, IBL → Allen"),
    ):
        c = calib[tag]
        row = (
            f"| {name} | {c['temperature_in_lab']:.2f} | {c['in_lab']['ece_before']:.2f} → "
            f"{c['in_lab']['ece_after']:.2f} | {c['cross_lab']['ece_before']:.2f} → "
            f"{c['cross_lab']['ece_after']:.2f} | {c['temperature_oracle']:.2f} |"
        )
        check(row in readme, f"README calibration row differs from {tag}.json: {row}")
    return {
        "file": "README.md",
        "within_ibl": float(found.group(1)),
        "within_allen": float(found.group(2)),
    }


def main() -> None:
    if len(sys.argv) != 3:
        fail("usage: python3 -I export_data.py <lfp2vec-audit clone> <out data.json>")
    repo, out_path = Path(sys.argv[1]).resolve(), Path(sys.argv[2])
    commit = subprocess.run(
        ["git", "-C", str(repo), "log", "-1", "--format=%H%n%cI"],
        check=True, capture_output=True, text=True,
    ).stdout.split()
    classes = regions(repo)
    runs, by_run = postprocess(repo)
    published_margins = check_against_fixes_table(repo, runs)
    calib = calibration(repo)
    published_within = check_readme(repo, runs, calib)
    view = four_class_view(repo)
    probe_info = probes(repo, by_run, classes, view, data_card(repo, classes))
    chunks = chunk_predictions(repo, by_run, classes, probe_info)
    # Calibration scores every test chunk, the five-class count, not the four-class view.
    for tag, c in chunks.items():
        check(calib[tag]["cross_lab"]["n_samples"] == c["n_chunks_all"],
              f"{tag}: calibration scores {calib[tag]['cross_lab']['n_samples']} chunks, "
              f"metrics.json 5class has {c['n_chunks_all']}")
    data = {
        "source": {
            "repo": "https://github.com/happyc0der/lfp2vec-audit",
            "commit": commit[0],
            "commit_date": commit[1],
            "exported_by": "public/demos/lfp2vec-audit/export_data.py",
        },
        "classes": classes,
        "classes_file": "lfpaudit/__init__.py",
        "view": {"name": "4class", "classes": view, "file": "lfpaudit/eval/runner.py"},
        "spectra": spectra(repo),
        "published": {
            "cross_lab_file": "docs/RESULTS_FIXES.md",
            "cross_lab": published_margins,
            "within": published_within,
        },
        "runs": runs,
        "probes": probe_info,
        "chunks": chunks,
        "calibration": calib,
    }
    text = json.dumps(data, separators=(",", ":"), allow_nan=False, ensure_ascii=False)
    out_path.write_text(text + "\n")
    print(f"wrote {out_path} ({len(text.encode())} bytes) from {commit[0][:7]}")
    for c in data["spectra"]["checkpoints"]:
        print(f"  {c['hz']:>3} Hz  Allen/IBL {c['from_csv']:8.2f}x  (D11 table {c['d11']}x)")


if __name__ == "__main__":
    main()
