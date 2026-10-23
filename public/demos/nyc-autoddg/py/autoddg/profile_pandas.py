"""Single-node pandas profiler: the same statistics as profile.py.

Serves as (1) the single-node baseline in benchmarks and (2) the correctness oracle
in tests. Shares type inference and output building with the Spark profiler so the
two produce directly comparable JSON.
"""

import time
from pathlib import Path

import pandas as pd

from autoddg.profile import (
    BOOL_VALUES,
    INT_RE,
    ISO_RE,
    NUM_RE,
    TOPK,
    US_DATE_RE,
    US_DATETIME_RE,
    _build_columns,
    _jsonable,
    wants_top_values,
)

# same regex -> format dispatch as the Spark profiler
TS_RULES = [(US_DATETIME_RE, "%m/%d/%Y %I:%M:%S %p"), (US_DATE_RE, "%m/%d/%Y"),
            (ISO_RE, "ISO8601")]


def _as_ts(v: pd.Series) -> pd.Series:
    # microsecond resolution: NYC data has typo dates like 0001-01-03 and 2996-07-19,
    # outside datetime64[ns]'s 1677-2262 range (Spark's timestamps handle them)
    out = pd.Series(pd.NaT, index=v.index, dtype="datetime64[us]")
    for pattern, fmt in TS_RULES:
        m = v.str.match(pattern)
        if m.any():
            out[m] = pd.to_datetime(v[m], format=fmt, errors="coerce").astype("datetime64[us]")
    return out


def _column_stats(i: int, s: pd.Series) -> dict:
    v = s.astype("string").str.strip().replace("", pd.NA).dropna()
    num = pd.to_numeric(v[v.str.match(NUM_RE)], errors="coerce").dropna().astype(float)
    ts = _as_ts(v).dropna()
    lengths = v.str.len()
    pct = num.quantile([0.25, 0.5, 0.75]).tolist() if len(num) else None
    stats = {
        "nonnull": len(v),
        "distinct": v.nunique(),
        "int_ok": int(v.str.match(INT_RE).sum()),
        "num_ok": len(num),
        "ts_ok": len(ts),
        "bool_ok": int(v.str.lower().isin(BOOL_VALUES).sum()),
        "min": num.min() if len(num) else None,
        "max": num.max() if len(num) else None,
        "mean": num.mean() if len(num) else None,
        "std": num.std() if len(num) > 1 else None,
        "pct": pct,
        "ts_min": ts.min().to_pydatetime() if len(ts) else None,
        "ts_max": ts.max().to_pydatetime() if len(ts) else None,
        "len_min": int(lengths.min()) if len(v) else None,
        "len_max": int(lengths.max()) if len(v) else None,
        "len_avg": float(lengths.mean()) if len(v) else None,
    }
    return {f"{i}_{k}": val for k, val in stats.items()}


def _top_values(df: pd.DataFrame, columns: list[dict]) -> None:
    for c in columns:
        if wants_top_values(c):
            v = df[c["name"]].astype("string").str.strip().replace("", pd.NA).dropna()
            counts = v.value_counts().rename_axis("v").reset_index(name="count")
            counts = counts.sort_values(["count", "v"], ascending=[False, True]).head(TOPK)
            c["top_values"] = [{"value": r.v, "count": int(r.count)} for r in counts.itertuples()]


def profile_pandas(path: str | Path, dataset_id: str | None = None) -> dict:
    t0 = time.perf_counter()
    path = Path(path)
    df = pd.read_parquet(path)
    raw = {}
    for i, name in enumerate(df.columns):
        raw |= _column_stats(i, df[name])
    columns = _build_columns(list(df.columns), len(df), raw)
    _top_values(df, columns)
    sample = [{k: (None if pd.isna(v) else _jsonable(v)) for k, v in r.items()}
              for r in df.head(5).to_dict("records")]
    return {
        "id": dataset_id or path.stem,
        "rows": len(df),
        "n_columns": len(columns),
        "columns": columns,
        "sample_rows": sample,
        "profile_seconds": round(time.perf_counter() - t0, 3),
    }
