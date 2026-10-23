"""Rebuild the demo's data files from a checkout of happyc0der/nyc-autoddg. See ../BUILD.md.

    python3 build_data.py --repo <nyc-autoddg checkout> --downloads <dir> --out <demo dir>

Standard library only. It copies the profiler sources verbatim, the committed Spark
profiles for the bundled CSVs, and the recorded evaluation outputs, and writes
data/sources.json (what each bundled CSV is, where it came from, and when).
"""

import argparse
import csv
import hashlib
import json
import shutil
from datetime import UTC, date, datetime
from pathlib import Path

SOURCES = ["__init__.py", "paths.py", "profile.py", "profile_pandas.py"]
BUNDLED = ["25th-nujf", "wxhr-qbhz", "a4qt-mpr5"]


def sha256(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", type=Path, required=True)
    ap.add_argument("--downloads", type=Path, required=True,
                    help="holds <id>.csv and <id>.meta.json for each bundled dataset")
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--downloaded", default=date.today().isoformat(),
                    help="date the CSVs were downloaded (YYYY-MM-DD)")
    a = ap.parse_args()
    repo, out = a.repo, a.out
    (out / "py" / "autoddg").mkdir(parents=True, exist_ok=True)
    (out / "data" / "profiles").mkdir(parents=True, exist_ok=True)

    for name in SOURCES:  # the profiler, byte for byte
        src, dst = repo / "src" / "autoddg" / name, out / "py" / "autoddg" / name
        shutil.copyfile(src, dst)
        assert sha256(src) == sha256(dst)
        print(f"copied src/autoddg/{name}  sha256 {sha256(dst)[:16]}")

    sources = []
    for ds in BUNDLED:
        csv_src, meta = a.downloads / f"{ds}.csv", json.loads(
            (a.downloads / f"{ds}.meta.json").read_text(encoding="utf-8"))
        shutil.copyfile(csv_src, out / "data" / f"{ds}.csv")
        shutil.copyfile(repo / "profiles" / f"{ds}.json", out / "data" / "profiles" / f"{ds}.json")
        with open(csv_src, newline="", encoding="utf-8-sig") as f:
            reader = csv.reader(f)
            header = next(reader)
            rows = sum(1 for _ in reader)
        committed = json.loads((repo / "profiles" / f"{ds}.json").read_text(encoding="utf-8"))
        assert rows == committed["rows"], f"{ds}: {rows} rows now, {committed['rows']} profiled"
        sources.append({
            "id": ds,
            "title": meta["name"],
            "agency": meta.get("attribution"),
            "attribution_link": meta.get("attributionLink"),
            "portal_url": f"https://data.cityofnewyork.us/d/{ds}",
            "export_url": f"https://data.cityofnewyork.us/api/views/{ds}/rows.csv?accessType=DOWNLOAD",
            "license": meta.get("license") or None,
            "rows_updated": datetime.fromtimestamp(meta["rowsUpdatedAt"], UTC).date().isoformat(),
            "downloaded": a.downloaded,
            "bytes": csv_src.stat().st_size,
            "sha256": sha256(csv_src),
            "rows": rows,
            "columns": len(header),
        })
        print(f"bundled {ds}: {rows:,} rows, {csv_src.stat().st_size:,} bytes")
    (out / "data" / "sources.json").write_text(json.dumps(sources, indent=1) + "\n", encoding="utf-8")

    # recorded LLM outputs and their evaluations, one record per dataset
    faith: dict[str, dict] = {}
    for r in csv.DictReader(open(repo / "results" / "eval_faithfulness.csv", encoding="utf-8")):
        faith.setdefault(r["id"], {})[r["kind"]] = {
            "words": int(r["words"]), "column_coverage": float(r["column_coverage"]),
            "claims": int(r["claims"]) if r["claims"] else None,
            "supported": int(r["supported"]) if r["supported"] else None,
            "unsupported": r["unsupported"]}
    judge: dict[str, dict] = {}
    for r in csv.DictReader(open(repo / "results" / "eval_judge.csv", encoding="utf-8")):
        judge.setdefault(r["id"], {})[r["kind"]] = {  # blank where the judge's reply didn't parse
            k: float(r[k]) if r[k] else None
            for k in ("completeness", "conciseness", "readability", "faithfulness")}
    judge_models = {json.loads(p.read_text(encoding="utf-8"))["judge_model"]
                    for p in (repo / "results" / "judge").glob("*.json")}
    records = []
    for p in sorted((repo / "descriptions").glob("*.json")):
        d = json.loads(p.read_text(encoding="utf-8"))
        prof = json.loads((repo / "profiles" / p.name).read_text(encoding="utf-8"))
        records.append({"id": d["id"], "title": d["title"], "model": d["model"],
                        "rows": prof["rows"], "n_columns": prof["n_columns"],
                        "ufd": d["ufd"], "sfd": d["sfd"],
                        "faithfulness": faith.get(d["id"]), "judge": judge.get(d["id"])})
    recorded = {"judge_model": sorted(judge_models), "datasets": records}
    (out / "data" / "recorded.json").write_text(
        json.dumps(recorded, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"recorded.json: {len(records)} datasets, judge {sorted(judge_models)}")

    for name in ("bench.csv", "eval_search.csv"):  # verbatim; the page computes medians
        shutil.copyfile(repo / "results" / name, out / "data" / name)
        print(f"copied results/{name}")


if __name__ == "__main__":
    main()
