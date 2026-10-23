"""Demo driver for the portfolio page. Not part of the nyc-autoddg repo.

It calls the repo's profile_pandas() unchanged. The one substitution: profile_pandas()
reads Parquet, and the repo's Parquet files come from download.py, which converts each
CSV export with pyarrow while keeping every column a string. Pyodide's pyarrow is a
further ~10 MB, so here pd.read_parquet is pointed, for the duration of the call, at a
pandas CSV reader that builds the same all-string table: the same header renaming and
the same set of null markers as pyarrow's CSV defaults.

compare() then checks the result against the profile the Spark profiler committed to
profiles/<id>.json, field by field.
"""

import csv
import json
import math

import pandas as pd

from autoddg.profile_pandas import profile_pandas

# pyarrow.csv.ConvertOptions().null_values, the markers download.py's
# strings_can_be_null=True turns into nulls (pandas' own default list adds "None" and "<NA>")
PYARROW_NULLS = ["", "#N/A", "#N/A N/A", "#NA", "-1.#IND", "-1.#QNAN", "-NaN", "-nan",
                 "1.#IND", "1.#QNAN", "N/A", "NA", "NULL", "NaN", "n/a", "nan", "null"]


def unique_names(names: list[str]) -> list[str]:
    # copied from src/autoddg/download.py (that module imports pyarrow and requests)
    seen: dict[str, int] = {}
    out = []
    for n in names:
        n = n.strip() or "column"
        k = seen.get(n.lower(), 0)
        seen[n.lower()] = k + 1
        out.append(n if k == 0 else f"{n}_{k + 1}")
    return out


def read_csv_as_strings(path: str) -> pd.DataFrame:
    with open(path, newline="", encoding="utf-8-sig", errors="replace") as f:
        header = next(csv.reader(f), [])
    return pd.read_csv(path, header=0, names=unique_names(header), dtype=str,
                       keep_default_na=False, na_values=PYARROW_NULLS,
                       encoding="utf-8-sig", encoding_errors="replace")


def run_profile(csv_path: str, dataset_id: str) -> str:
    real = pd.read_parquet
    pd.read_parquet = lambda _path, *a, **k: read_csv_as_strings(csv_path)
    try:
        prof = profile_pandas(csv_path, dataset_id)
    finally:
        pd.read_parquet = real
    # same serialisation as profile.py's profile_many(): json.dumps(..., default=str)
    return json.dumps(prof, default=str)


# Fields the Spark profiler computes approximately: approx_count_distinct(rsd=0.02),
# unique_frac derived from it, and percentile_approx(accuracy=1000) for the quartiles,
# where pandas interpolates exactly. A difference there is expected, not a bug.
APPROX = {"distinct_approx", "unique_frac", "p25", "median", "p75"}
FIELDS = ["type", "semantic", "null_frac", "distinct_approx", "unique_frac", "min", "max",
          "mean", "std", "p25", "median", "p75", "len_min", "len_max", "len_avg",
          "top_values", "flags"]


def _same(a, b) -> bool:
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        if math.isclose(a, b, rel_tol=0, abs_tol=0):
            return True
        # both sides are rounded to 4 decimals by profile._num; allow one unit of rounding
        return abs(a - b) <= 1e-4 * max(1.0, abs(a), abs(b))
    return a == b


def compare(mine_json: str, spark_json: str) -> str:
    mine, spark = json.loads(mine_json), json.loads(spark_json)
    rows = []

    def add(column, field, a, b):
        status = "match" if _same(a, b) else ("approx" if field in APPROX else "differs")
        rows.append({"column": column, "field": field, "browser": a, "spark": b,
                     "status": status})

    add(None, "rows", mine["rows"], spark["rows"])
    add(None, "n_columns", mine["n_columns"], spark["n_columns"])
    add(None, "sample_rows", mine["sample_rows"], spark["sample_rows"])
    spark_cols = {c["name"]: c for c in spark["columns"]}
    for c in mine["columns"]:
        s = spark_cols.get(c["name"])
        if s is None:
            add(c["name"], "name", c["name"], None)
            continue
        for f in FIELDS:
            if f in c or f in s:
                add(c["name"], f, c.get(f), s.get(f))
    return json.dumps(rows, default=str)
