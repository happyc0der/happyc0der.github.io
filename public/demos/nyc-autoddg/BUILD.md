# NYC AutoDDG demo: how it is built

Source repo: https://github.com/happyc0der/nyc-autoddg at commit
`e7d18b1d2682c8848eebe95e3a13cbd99ec5df18` (2026-09-11).

## What runs, and what is only recorded

| Part | Where it comes from |
|---|---|
| `py/autoddg/__init__.py`, `paths.py`, `profile.py`, `profile_pandas.py` | copied byte for byte from `src/autoddg/` (sha256 checked by the build script) |
| `py/pyspark/**` | demo code: empty placeholder classes so `profile.py` imports without Spark (it uses pyspark only inside its Spark functions) |
| `py/demo_driver.py` | demo code: calls the repo's `profile_pandas()` unchanged, with `pd.read_parquet` pointed at a pandas CSV reader for the duration of the call, then compares the result with the committed Spark profile |
| `data/<id>.csv` | NYC Open Data CSV exports, downloaded unmodified (see `data/sources.json`) |
| `data/profiles/<id>.json` | the repo's committed Spark profiles for those three datasets |
| `data/recorded.json` | built from the repo's `descriptions/*.json`, `results/eval_faithfulness.csv`, `results/eval_judge.csv` and `results/judge/*.json`: recorded qwen3:14b and llama3.1:8b outputs |
| `data/bench.csv`, `data/eval_search.csv` | copied verbatim from `results/`; the page computes medians from them |
| `index.html`, `app.css`, `app.js`, `charts.js` | the page |

Runtime: Pyodide 0.29.5 from `cdn.jsdelivr.net/pyodide/v0.29.5/full/` via
`../_shared/pyodide.js`, loaded only when the visitor presses Run. It brings Python 3.13,
numpy 2.2.5 and pandas 2.3.3 (with python-dateutil, pytz and six): ten files, about 13.1 MB
compressed on the wire (20.4 MB uncompressed), measured 2026-10-23. The repo itself locks
pandas 3.0.5; the check below shows both versions give the same profiles on these files.

Why a CSV reader instead of Parquet: `profile_pandas()` reads the Parquet files that the
repo's `download.py` makes with pyarrow, keeping every column a string. Pyodide's pyarrow
would add about 10 MB, so the driver reads the CSV with pandas using pyarrow's exact null
markers (`pyarrow.csv.ConvertOptions().null_values`) and `download.py`'s header renaming.

## Regenerate

From the portfolio repo root (Python 3.12+ standard library only for the build step):

```sh
git clone https://github.com/happyc0der/nyc-autoddg /tmp/nyc-autoddg
git -C /tmp/nyc-autoddg checkout e7d18b1d2682c8848eebe95e3a13cbd99ec5df18

mkdir -p /tmp/nyc-dl
for id in 25th-nujf wxhr-qbhz a4qt-mpr5; do
  curl -fsSL --retry 5 --retry-all-errors \
    "https://data.cityofnewyork.us/api/views/$id/rows.csv?accessType=DOWNLOAD" -o /tmp/nyc-dl/$id.csv
  curl -fsSL --retry 5 --retry-all-errors \
    "https://data.cityofnewyork.us/api/views/$id.json" -o /tmp/nyc-dl/$id.meta.json
done

python3 -I -B public/demos/nyc-autoddg/_build/build_data.py \
  --repo /tmp/nyc-autoddg --downloads /tmp/nyc-dl \
  --out public/demos/nyc-autoddg --downloaded "$(date -u +%F)"
```

The export endpoint sometimes answers 503 while it builds the file; the retries cover that.
The build script stops if a CSV's row count no longer matches the committed profile, which
would mean NYC has updated the dataset since the profile was made. The copies bundled here
were downloaded on 2026-10-23; their sha256 values are in `data/sources.json`.

The `py/pyspark/` shim, `py/demo_driver.py` and the page files are hand-written and are
not touched by the build.

## Check the driver against the repo's own pipeline

```sh
uv venv -p 3.13 /tmp/autoddg-venv
VIRTUAL_ENV=/tmp/autoddg-venv uv pip install pandas==3.0.5 numpy==2.5.3 pyarrow==25.0.1 requests
/tmp/autoddg-venv/bin/python -I -B public/demos/nyc-autoddg/_build/check_equivalence.py \
  --repo /tmp/nyc-autoddg --downloads /tmp/nyc-dl --demo public/demos/nyc-autoddg
```

Result on 2026-10-23, identical under pandas 3.0.5 (the repo's lock) and 2.3.3 (Pyodide's):

```
25th-nujf: demo == repo pipeline: True; vs committed Spark profile: 65 identical, 6 Spark estimates, 0 differ, of 71
wxhr-qbhz: demo == repo pipeline: True; vs committed Spark profile: 237 identical, 36 Spark estimates, 0 differ, of 273
a4qt-mpr5: demo == repo pipeline: True; vs committed Spark profile: 172 identical, 28 Spark estimates, 0 differ, of 200
```

"Identical" means exactly equal after both sides' 4-decimal rounding. The "Spark
estimates" are the fields that are not, all of them `distinct_approx` and `unique_frac`
(Spark's `approx_count_distinct` with 2% error against pandas' exact `nunique()`) or
quartiles (`percentile_approx` against pandas' interpolated `quantile`). Every field both
sides compute exactly is equal.

The same browser code was also run in headless Edge on a synthetic CSV with duplicate
headers, a BOM, CRLF line ends, quoted newlines, `N/A`/`NULL`/`None` values and US and ISO
dates; its JSON was identical to the repo pipeline's under both pandas versions.

## Data terms

The three CSVs are NYC Open Data datasets: Popular Baby Names (25th-nujf, Department of
Health and Mental Hygiene), Cool It! NYC 2020 - Drinking Fountains (wxhr-qbhz, Department of
Parks and Recreation) and Parks Closure Status Due to COVID-19: Playgrounds (a4qt-mpr5,
Department of Parks and Recreation). The portal lists no licence for them. NYC
Administrative Code §23-502(d) makes public datasets available without registration,
licence requirements or restrictions on use, and lets the City require anyone republishing
one to identify its source and version and describe modifications. The page does that for
each dataset (source, agency, download date, portal update date, sha256, no modifications).

## Not in the page

- Spark itself: it needs a JVM. The Spark side appears only as the committed profiles and
  the recorded timings.
- The LLM stages: descriptions and judge scores are recorded outputs, not generated live.
- The portal's original descriptions: they live in the repo's git-ignored `data/catalog.json`,
  so the search experiment is shown only as its recorded `results/eval_search.csv`.
- `profile_seconds` in the page is the browser's time for one WebAssembly thread, shown with
  that caveat; it is not a benchmark.
