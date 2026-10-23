"""Project directory layout. Everything generated lives under the repo root."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

DATA = ROOT / "data"
RAW = DATA / "raw"              # CSV exports from NYC Open Data
PARQUET = DATA / "parquet"      # one-time Parquet conversion of RAW
CATALOG = DATA / "catalog.json" # selected datasets + original metadata (ground truth)

PROFILES = ROOT / "profiles"        # <id>.json from the Spark profiler
DESCRIPTIONS = ROOT / "descriptions"  # <id>.json with UFD + SFD
RESULTS = ROOT / "results"          # benchmark + evaluation CSVs
FIGURES = ROOT / "report" / "figures"


def ensure_dirs() -> None:
    for d in (RAW, PARQUET, PROFILES, DESCRIPTIONS, RESULTS, FIGURES):
        d.mkdir(parents=True, exist_ok=True)
