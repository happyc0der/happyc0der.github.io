"""Export the committed results of happyc0der/eeg-dementia-graph-transformer into data.json for
the portfolio demo at /demos/eeg-dementia/.

Standard library only. Nothing is fitted or re-run: every number comes from files committed in
the repository, and the script checks that the recomputation the page does in JavaScript
(argmax of the saved subject probabilities -> confusion matrix -> balanced accuracy) reproduces
the repository's own metric files before it writes anything.

    python3 -I export_data.py --repo <clone> --content <portfolio>/content/projects/eeg-dementia.md \
        --html ../index.html --out ../data.json
"""
import argparse
import csv
import json
import math
import re
import subprocess
from pathlib import Path

CLASSES = ["AD", "CN", "FTD"]

# id: (label, group, flags). Groups follow the repo README: phase-1 feature models, phase-2 deep
# models, hybrids and baselines. "headline" marks the 17 rows of the README's main 3-class table.
MODELS = {
    "ensemble_vote": ("Soft vote of 3 feature models", "feature", {"headline": True, "reference": True, "prespecified": True}),
    "all_lgbm": ("LightGBM, all features", "feature", {"headline": True}),
    "spectral_lr": ("Spectral LR", "feature", {"headline": True, "prespecified": True}),
    "all_lr": ("LR, all features", "feature", {"headline": True}),
    "rbp_lr": ("LR, relative band power", "feature", {"headline": True}),
    "nested_select": ("Nested model selection", "feature", {"headline": True}),
    "all_lr+age_sex": ("LR, all features + age, sex", "feature", {}),
    "all_linsvm": ("Linear SVM, all features", "feature", {}),
    "all_rf": ("Random forest, all features", "feature", {}),
    "all_rbfsvm": ("RBF SVM, all features", "feature", {}),
    "spectral_rbfsvm": ("RBF SVM, spectral features", "feature", {}),
    "spectral_lr+age_sex": ("Spectral LR + age, sex", "feature", {}),
    "all_enet": ("Elastic net, all features", "feature", {}),
    "connectivity_lr": ("LR, connectivity features", "feature", {}),
    "spectral_region_lr": ("LR, regional spectral features", "feature", {}),
    "riemann_ts_lr": ("Riemannian tangent-space LR", "feature", {}),
    "complexity_lr": ("LR, complexity features", "feature", {}),
    "riemann_mdm": ("Riemannian MDM", "feature", {}),
    "labram_lr": ("LaBraM frozen + LR", "foundation", {"headline": True}),
    "cbramod_lr": ("CBraMod frozen + LR", "foundation", {"headline": True}),
    "cbramod_ft": ("CBraMod fine-tuned", "foundation", {"headline": True}),
    "biot_lr": ("BIOT frozen + LR", "foundation", {"headline": True, "exploratory": True}),
    "shallow": ("ShallowFBCSPNet", "cnn", {"headline": True}),
    "eegnet": ("EEGNet", "cnn", {"headline": True}),
    "cbramod_spectral_lr": ("CBraMod frozen + spectral + LR", "hybrid", {"headline": True}),
    "ensemble_vote+cbramod_lr": ("Soft vote + CBraMod LR", "hybrid", {"headline": True}),
    "ensemble_vote+shallow": ("Soft vote + ShallowFBCSPNet", "hybrid", {"headline": True, "post_hoc": True}),
    "ensemble_vote+labram_lr": ("Soft vote + LaBraM LR", "hybrid", {"post_hoc": True}),
    "ensemble_vote+cbramod_ft": ("Soft vote + CBraMod fine-tuned", "hybrid", {}),
    "age_sex_lr": ("Age + sex only", "baseline", {"headline": True}),
    "age_lr": ("Age only", "baseline", {}),
    "chance_prior": ("Chance (class prior)", "baseline", {"headline": True}),
}

LEGACY_LOG = "legacy/results/spatial_spectral_dim128_20250405/training_log.txt"
LEGACY_TEST = "legacy/results/spatial_spectral_dim128_20250405/reeval_matched_features/test_cross_results.txt"
PERMUTATIONS = ["results/permutation/spectral_lr.json", "results/permutation/rbp_lr.json",
                "results/phase2/permutation/cbramod_lr.json"]
PAIRED = "results/phase2/tables/paired_cv3.json"


def model_dir(repo: Path, mid: str) -> Path:
    p1 = repo / "results" / "cv3" / mid
    return p1 if p1.is_dir() else repo / "results" / "phase2" / "cv3" / mid


def argmax(p):
    # numpy's argmax: the first maximum wins.
    best = 0
    for i in range(1, len(p)):
        if p[i] > p[best]:
            best = i
    return best


def bal_acc(y, pred):
    cm = [[0] * 3 for _ in range(3)]
    for t, q in zip(y, pred):
        cm[t][q] += 1
    rec = [cm[i][i] / sum(cm[i]) for i in range(3)]
    return sum(rec) / 3, cm


def parse_csv_table(path: Path):
    """'61.1 ± 3.0 [53.6, 68.0]' strings of the README-facing tables, kept for a cross-check."""
    out = {}
    for row in csv.DictReader(path.open()):
        key = row["model"].replace(" (phase 1)", "").replace(" [post hoc]", "")
        cell = row["subject bal. acc. % (sd) [95% CI]"]
        m = re.match(r"([\d.]+) ± ([\d.]+) \[([\d.]+), ([\d.]+)\]", cell)
        out[key] = tuple(float(x) for x in m.groups())
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True, type=Path)
    ap.add_argument("--content", required=True, type=Path)
    ap.add_argument("--html", required=True, type=Path)
    ap.add_argument("--out", required=True, type=Path)
    a = ap.parse_args()
    repo = a.repo

    commit = subprocess.run(["git", "-C", str(repo), "rev-parse", "HEAD"], capture_output=True, text=True,
                            check=True).stdout.strip()

    # The team-credit line must appear on the page exactly as the content file gives it.
    front = a.content.read_text().split("---")[1]
    credit = re.search(r'^credit: "(.*)"$', front, re.M).group(1)
    assert "\\" not in credit and '"' not in credit, "credit uses YAML escapes; compare the parsed value instead"
    html = a.html.read_text()
    assert credit in html, "index.html does not carry the content file's credit line verbatim"

    tables = parse_csv_table(repo / "results/tables/cv3.csv")
    tables.update(parse_csv_table(repo / "results/phase2/tables/cv3.csv"))
    paired_all = json.loads((repo / PAIRED).read_text())

    subjects = folds = y_ref = None
    models = {}
    for mid, (label, group, flags) in MODELS.items():
        d = model_dir(repo, mid)
        summ = json.loads((d / "summary.json").read_text())
        assert summ["class_names"] == CLASSES and summ["task"] == "cv3", mid
        rows = list(csv.DictReader((d / "predictions_subject.csv").open()))
        if subjects is None:
            subjects = sorted({r["subject"] for r in rows})
        idx = {s: i for i, s in enumerate(subjects)}
        n = len(subjects)
        y = [None] * n
        f = [[None] * n for _ in range(10)]
        p = [[None] * (3 * n) for _ in range(10)]
        for r in rows:
            rep, i = int(r["repeat"]), idx[r["subject"]]
            y[i] = int(r["y"])
            f[rep][i] = int(r["fold"])
            for k, c in enumerate(CLASSES):
                v = r[f"p_{c}"]
                assert re.fullmatch(r"\d\.\d{5}", v), (mid, v)
                p[rep][3 * i + k] = int(v.replace(".", ""))  # exact: five decimals as committed
        assert all(v is not None for v in y) and all(v is not None for row in p for v in row), mid
        if y_ref is None:
            y_ref, folds = y, f
        assert y == y_ref and f == folds, f"{mid}: labels or outer folds differ from the other models"

        # Recompute exactly what the page recomputes and compare with the repo's metric files.
        per_repeat = [float(r["balanced_accuracy"]) for r in csv.DictReader((d / "metrics_subject_per_repeat.csv").open())]
        ours, summed = [], [[0] * 3 for _ in range(3)]
        for rep in range(10):
            pred = [argmax(p[rep][3 * i:3 * i + 3]) for i in range(n)]
            ba, cm = bal_acc(y, pred)
            ours.append(ba)
            for i in range(3):
                for j in range(3):
                    summed[i][j] += cm[i][j]
            assert abs(ba - per_repeat[rep]) <= 5e-6, (mid, rep, ba, per_repeat[rep])
        s = summ["subject"]
        assert summed == s["confusion_summed"], (mid, summed, s["confusion_summed"])
        mean = sum(ours) / 10
        assert abs(mean - s["balanced_accuracy"]["mean"]) < 1e-9, (mid, mean, s["balanced_accuracy"]["mean"])
        t = tables[mid]
        assert round(100 * s["balanced_accuracy"]["mean"], 1) == t[0] and round(100 * s["balanced_accuracy"]["ci95"][0], 1) == t[2], mid

        paired = paired_all.get(f"{mid} vs ensemble_vote")
        models[mid] = {
            "label": label,
            "group": group,
            **flags,
            "phase": 2 if "phase2" in str(d) else 1,
            "description": summ.get("description", ""),
            "path": str(d.relative_to(repo)),
            "bal": [s["balanced_accuracy"]["mean"], s["balanced_accuracy"]["sd"], *s["balanced_accuracy"]["ci95"]],
            "auc": s["macro_auc"]["mean"],
            "recall": [s[f"recall_{c}"]["mean"] for c in CLASSES],
            "per_repeat": per_repeat,
            "confusion_summed": s["confusion_summed"],
            "paired": None if paired is None else {
                "mean": paired["mean_diff"], "lo": paired["boot_ci95"][0], "hi": paired["boot_ci95"][1],
                "p": paired["boot_p_a_le_b"]},
            "p": p,
        }

    # The 2025 team run: validation accuracy per epoch on chunk-level folds.
    log = (repo / LEGACY_LOG).read_text()
    pat = re.compile(r"Fold (\d)/5, Epoch (\d+)/200, Train Loss: ([\d.]+|nan), Valid Loss: ([\d.]+|nan), "
                     r"Accuracy: ([\d.]+)%, F1: ([\d.]+), LR: ([\d.]+)")
    lfolds = {}
    for m in pat.finditer(log):
        fo, ep, acc = int(m.group(1)), int(m.group(2)), float(m.group(5))
        lfolds.setdefault(fo, []).append((ep, acc))
    n_lines = sum(1 for line in log.splitlines() if re.match(r"Fold \d/5, Epoch", line))
    assert sum(len(v) for v in lfolds.values()) == n_lines, "unparsed epoch lines in the legacy log"
    stops = [int(x) for x in re.findall(r"Early stopping at epoch (\d+)", log)]
    legacy_folds = []
    for fo in sorted(lfolds):
        eps = lfolds[fo]
        assert [e for e, _ in eps] == list(range(1, len(eps) + 1)), fo
        legacy_folds.append({"fold": fo, "acc": [acc for _, acc in eps], "stop": stops[fo - 1]})
    params = re.search(r"Total trainable parameters: ([\d,]+)", log).group(1)

    test = (repo / LEGACY_TEST).read_text()
    legacy_test = {
        "acc": float(re.search(r"^Accuracy: ([\d.]+)%", test, re.M).group(1)),
        "bal": float(re.search(r"^Balanced Accuracy: ([\d.]+)%", test, re.M).group(1)),
        "chunks": int(re.search(r"^Samples: (\d+)", test, re.M).group(1)),
        "path": LEGACY_TEST,
    }

    perms = []
    for rel in PERMUTATIONS:
        d = json.loads((repo / rel).read_text())
        assert d["metric"] == "balanced_accuracy" and len(d["null"]) == d["n_perm"]
        assert max(d["null"]) < d["observed"]
        perms.append({"model": d["model"], "observed": d["observed"], "null": [round(v, 6) for v in d["null"]],
                      "p": d["p_value"], "n_perm": d["n_perm"], "null_95th": d["null_95th"], "path": rel})

    out = {
        "source": {"repo": "https://github.com/happyc0der/eeg-dementia-graph-transformer", "commit": commit},
        "classes": CLASSES,
        "subjects": subjects,
        "y": y_ref,
        "folds": folds,
        "models": models,
        "legacy": {"path": LEGACY_LOG, "params": params, "folds": legacy_folds, "test": legacy_test},
        "permutation": perms,
    }
    a.out.write_text(json.dumps(out, separators=(",", ":")))
    print(f"wrote {a.out} ({a.out.stat().st_size:,} bytes) from {commit[:12]}: {len(models)} models, "
          f"{len(subjects)} subjects, all per-repeat balanced accuracies and summed confusion matrices match")


if __name__ == "__main__":
    main()
