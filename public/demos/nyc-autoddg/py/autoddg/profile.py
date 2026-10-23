"""PySpark dataset profiler.

Input columns are all strings. Type inference and statistics happen in a single
aggregation pass: for every column we speculatively compute integer, float, date and
text statistics side by side (values that don't match a type become null), and decide
the column's type from the parse success rates afterwards. A second job computes
top-k values for all low-cardinality columns at once (explode + groupBy).

Parsing is regex-guarded: a value is only cast once its shape matches, because failed
casts in Spark are exception-driven and dominated the runtime (~5x) when unguarded.

`naive=True` runs one Spark job per column per statistic group instead, the textbook
approach, kept as a baseline for the benchmark.

Uses only the DataFrame API so the same code runs on Databricks serverless.

    uv run python -m autoddg.profile                   # all datasets in data/parquet
    uv run python -m autoddg.profile --ids abcd-1234   # specific datasets
"""

import argparse
import json
import math
import re
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime
from pathlib import Path

from pyspark.sql import Column, DataFrame, SparkSession, Window
from pyspark.sql import functions as F

from autoddg.paths import PARQUET, PROFILES, ensure_dirs

PASS_RATIO = 0.98        # share of non-null values that must parse to accept a type
CATEGORICAL_MAX = 50     # distinct values at or below which a text column is categorical
TOPK_MAX_DISTINCT = 1000 # only compute top-k where distinct count is at most this
TOPK = 5
COLS_PER_PASS = 60       # cap on columns per aggregation, keeps generated code manageable
BOOL_VALUES = ["true", "false", "yes", "no", "y", "n", "t", "f"]
# Parsers are only applied to values whose shape already matches a regex. A failed
# try_cast / try_to_timestamp is expensive in Spark (exception-driven), and most
# values in most columns are not numbers or dates: guarding cut profiling time ~5x.
INT_RE = r"^[+-]?\d+$"   # regex, not try_cast: Spark's cast truncates "70.5" to 70
NUM_RE = r"^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$"
# Socrata CSV exports use US format; the SODA API returns ISO timestamps.
US_DATETIME_RE = r"^\d{1,2}/\d{1,2}/\d{4} \d{1,2}:\d{2}:\d{2} [AP]M$"
US_DATE_RE = r"^\d{1,2}/\d{1,2}/\d{4}$"
ISO_RE = r"^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?)?$"

SEMANTIC_PATTERNS = [  # (hint, column-name regex); first match wins
    ("zip_code", r"zip|postcode|postal"),
    ("borough", r"^boro|borough"),
    ("bbl", r"\bbbl\b"),
    ("latitude", r"^lat(itude)?$|_lat$|\blatitude\b"),
    ("longitude", r"^(lon|lng|long)(itude)?$|_lon$|\blongitude\b"),
    ("geometry", r"the_geom|geometry|location( 1)?$|^point$|polygon"),
    ("phone", r"phone|telephone"),
    ("email", r"e-?mail"),
    ("address", r"address|street|^block$|^lot$"),
    ("geo_district", r"council|community (board|district)|census|\bnta\b|precinct"
                     r"|school district"),
    ("identifier", r"(^|[ _])(id|number|no|num|code|key)$|^id[ _]|unique key"),
]


def _clean(c: str) -> Column:
    """Trimmed value, with empty strings treated as null."""
    t = F.trim(F.col(f"`{c}`"))
    return F.when(t == "", None).otherwise(t)


def _as_ts(v: Column) -> Column:
    return (F.when(v.rlike(US_DATETIME_RE), F.try_to_timestamp(v, F.lit("M/d/yyyy h:mm:ss a")))
            .when(v.rlike(US_DATE_RE), F.try_to_timestamp(v, F.lit("M/d/yyyy")))
            .when(v.rlike(ISO_RE), v.try_cast("timestamp")))


def _derived(i: int, c: str) -> list[Column]:
    """Per-column projection: cleaned value, numeric parse, timestamp parse.

    Projecting first means each parse runs once per value, not once per statistic.
    """
    v = _clean(c)
    return [v.alias(f"v{i}"),
            F.when(v.rlike(NUM_RE), v.try_cast("double")).alias(f"n{i}"),
            _as_ts(v).alias(f"t{i}")]


def _column_exprs(i: int) -> list[Column]:
    v, num, ts = F.col(f"v{i}"), F.col(f"n{i}"), F.col(f"t{i}")
    return [
        F.count(v).alias(f"{i}_nonnull"),
        F.approx_count_distinct(v, 0.02).alias(f"{i}_distinct"),
        F.sum(v.rlike(INT_RE).cast("int")).alias(f"{i}_int_ok"),
        F.count(num).alias(f"{i}_num_ok"),
        F.count(ts).alias(f"{i}_ts_ok"),
        F.sum(F.lower(v).isin(BOOL_VALUES).cast("int")).alias(f"{i}_bool_ok"),
        F.min(num).alias(f"{i}_min"),
        F.max(num).alias(f"{i}_max"),
        F.avg(num).alias(f"{i}_mean"),
        F.stddev(num).alias(f"{i}_std"),
        F.percentile_approx(num, [0.25, 0.5, 0.75], 1000).alias(f"{i}_pct"),
        F.min(ts).alias(f"{i}_ts_min"),
        F.max(ts).alias(f"{i}_ts_max"),
        F.min(F.length(v)).alias(f"{i}_len_min"),
        F.max(F.length(v)).alias(f"{i}_len_max"),
        F.avg(F.length(v)).alias(f"{i}_len_avg"),
    ]


def _stats_single_pass(df: DataFrame) -> tuple[int, dict]:
    cols = df.columns
    raw, rows = {}, None
    for start in range(0, len(cols), COLS_PER_PASS):
        chunk = list(enumerate(cols))[start:start + COLS_PER_PASS]
        proj = df.select(*[d for i, c in chunk for d in _derived(i, c)])
        exprs = [F.count(F.lit(1)).alias("__rows")]
        for i, _ in chunk:
            exprs += _column_exprs(i)
        row = proj.agg(*exprs).first().asDict()
        rows = row.pop("__rows")
        raw |= row
    return rows, raw


def _stats_naive(df: DataFrame) -> tuple[int, dict]:
    rows = df.count()
    raw = {}
    for i, c in enumerate(df.columns):
        proj = df.select(*_derived(i, c))
        for e in _column_exprs(i):  # one job per statistic, as a naive loop would do
            raw |= proj.agg(e).first().asDict()
    return rows, raw


def _infer_type(s: dict) -> str:
    n = s["nonnull"]
    if n == 0:
        return "empty"
    if s["int_ok"] >= PASS_RATIO * n:
        return "integer"
    if s["num_ok"] >= PASS_RATIO * n:
        return "float"
    if s["ts_ok"] >= PASS_RATIO * n:
        return "datetime"
    if s["bool_ok"] >= PASS_RATIO * n and s["distinct"] <= 3:
        return "boolean"
    if s["distinct"] <= CATEGORICAL_MAX:
        return "categorical"
    return "text"


def _semantic(name: str, typ: str, s: dict) -> str | None:
    lname = name.lower()
    for hint, pattern in SEMANTIC_PATTERNS:
        if re.search(pattern, lname):
            if hint == "latitude" and typ == "float" and not (40.0 <= (s["mean"] or 0) <= 41.5):
                continue
            if hint == "longitude" and typ == "float" and not (-75.0 <= (s["mean"] or 0) <= -73.0):
                continue
            return hint
    if typ == "datetime":
        return "date"
    return None


NYC_BOUNDS = {"latitude": (40.4, 41.0), "longitude": (-74.3, -73.6), "zip_code": (10001, 11697)}


def _quality_flags(col: dict) -> list[str]:
    """Data-quality caveats visible from the column stats alone."""
    flags = []
    if col["null_frac"] is not None and col["null_frac"] >= 0.5:
        flags.append(f"mostly missing ({col['null_frac']:.0%} null)")
    lo_hi = NYC_BOUNDS.get(col["semantic"])
    if (lo_hi and col["type"] in ("integer", "float") and col["min"] is not None
            and (col["min"] < lo_hi[0] or col["max"] > lo_hi[1])):
        flags.append(f"values outside NYC range (min {col['min']}, max {col['max']})")
    if col["type"] == "datetime" and col["min"]:
        if col["min"][:4] < "1950":
            flags.append(f"placeholder-like early dates (min {col['min'][:10]})")
        if col["max"][:10] > datetime.now().date().isoformat():
            flags.append(f"future dates (max {col['max'][:10]})")
    if col["type"] != "empty" and col["distinct_approx"] == 1:
        flags.append("constant value")
    return flags


def _num(x):
    if x is None or (isinstance(x, float) and (math.isnan(x) or math.isinf(x))):
        return None
    return round(x, 4) if isinstance(x, float) else x


def _jsonable(x):
    if isinstance(x, (datetime, date)):
        return x.isoformat()
    return _num(x)


def _build_columns(cols: list[str], rows: int, raw: dict) -> list[dict]:
    out = []
    for i, name in enumerate(cols):
        s = {k[len(f"{i}_"):]: v for k, v in raw.items() if k.startswith(f"{i}_")}
        typ = _infer_type(s)
        col = {
            "name": name,
            "type": typ,
            "semantic": _semantic(name, typ, s),
            "null_frac": round(1 - s["nonnull"] / rows, 4) if rows else None,
            "distinct_approx": s["distinct"],
            "unique_frac": round(s["distinct"] / s["nonnull"], 4) if s["nonnull"] else None,
        }
        if typ in ("integer", "float"):
            pct = s["pct"] or [None] * 3
            col |= {"min": _num(s["min"]), "max": _num(s["max"]), "mean": _num(s["mean"]),
                    "std": _num(s["std"]), "p25": _num(pct[0]), "median": _num(pct[1]),
                    "p75": _num(pct[2])}
        elif typ == "datetime":
            col |= {"min": _jsonable(s["ts_min"]), "max": _jsonable(s["ts_max"])}
        elif typ in ("text", "categorical", "boolean"):
            col |= {"len_min": s["len_min"], "len_max": s["len_max"],
                    "len_avg": _num(s["len_avg"])}
        col["flags"] = _quality_flags(col)
        out.append(col)
    return out


def wants_top_values(c: dict) -> bool:
    """Low-cardinality, non-numeric, and not near-unique (all-1 counts say nothing)."""
    return (c["type"] in ("categorical", "boolean", "text")
            and 0 < c["distinct_approx"] <= TOPK_MAX_DISTINCT
            and c["unique_frac"] < 0.5)


def _top_values(df: DataFrame, columns: list[dict], naive: bool) -> None:
    """Fill columns[i]["top_values"] for low-cardinality non-numeric columns."""
    targets = [(i, c["name"]) for i, c in enumerate(columns) if wants_top_values(c)]
    if not targets:
        return

    if naive:
        for i, name in targets:
            rows = (df.select(_clean(name).alias("v")).where("v IS NOT NULL")
                    .groupBy("v").count().orderBy(F.desc("count"), "v").limit(TOPK).collect())
            columns[i]["top_values"] = [{"value": r["v"], "count": r["count"]} for r in rows]
        return

    # all target columns in one job: (col_idx, value) pairs -> count -> top-k per column
    pairs = F.explode(F.array(*[
        F.struct(F.lit(i).alias("i"), _clean(name).alias("v")) for i, name in targets
    ])).alias("p")
    counts = (df.select(pairs).select("p.i", "p.v").where("v IS NOT NULL")
              .groupBy("i", "v").count())
    ranked = counts.withColumn(
        "r", F.row_number().over(Window.partitionBy("i").orderBy(F.desc("count"), "v")))
    for r in ranked.where(F.col("r") <= TOPK).orderBy("i", "r").collect():
        columns[r["i"]].setdefault("top_values", []).append({"value": r["v"], "count": r["count"]})


def profile_df(df: DataFrame, dataset_id: str, naive: bool = False) -> dict:
    t0 = time.perf_counter()
    rows, raw = (_stats_naive if naive else _stats_single_pass)(df)
    columns = _build_columns(df.columns, rows, raw)
    _top_values(df, columns, naive)
    sample = [{k: v for k, v in r.asDict().items()} for r in df.limit(5).collect()]
    return {
        "id": dataset_id,
        "rows": rows,
        "n_columns": len(columns),
        "columns": columns,
        "sample_rows": sample,
        "profile_seconds": round(time.perf_counter() - t0, 3),
    }


def profile_path(spark: SparkSession, path: str | Path, dataset_id: str | None = None,
                 naive: bool = False) -> dict:
    path = Path(path)
    df = spark.read.parquet(str(path))
    return profile_df(df, dataset_id or path.stem, naive=naive)


def profile_many(spark: SparkSession, paths: list[Path], concurrency: int = 1,
                 naive: bool = False, out_dir: Path | None = PROFILES) -> list[dict]:
    """Profile datasets, optionally running several Spark jobs concurrently.

    Small files fit in a single partition, so one job alone keeps just one core busy;
    concurrent jobs (FAIR scheduler) are how many small datasets use all cores.
    """
    def one(p: Path) -> dict:
        prof = profile_path(spark, p, naive=naive)
        if out_dir is not None:
            (out_dir / f"{prof['id']}.json").write_text(json.dumps(prof, indent=1, default=str))
        return prof

    with ThreadPoolExecutor(max_workers=concurrency) as pool:
        return list(pool.map(one, paths))


def main() -> None:
    from autoddg.spark import get_spark

    ap = argparse.ArgumentParser()
    ap.add_argument("--ids", nargs="*")
    ap.add_argument("--master", default="local[*]")
    ap.add_argument("--concurrency", type=int, default=8)
    ap.add_argument("--naive", action="store_true")
    args = ap.parse_args()

    ensure_dirs()
    paths = sorted(PARQUET.glob("*.parquet"))
    paths = [p for p in paths if not p.stem.startswith("311_")]  # the large file is for benchmarks
    if args.ids:
        paths = [p for p in paths if p.stem in set(args.ids)]

    spark = get_spark(args.master)
    t = time.perf_counter()
    profs = profile_many(spark, paths, concurrency=args.concurrency, naive=args.naive)
    print(f"profiled {len(profs)} datasets ({sum(p['rows'] for p in profs):,} rows) "
          f"in {time.perf_counter() - t:.1f}s")
    spark.stop()


if __name__ == "__main__":
    main()
