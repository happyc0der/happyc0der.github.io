"""Check the demo driver against the repo's own pipeline, outside the browser. See ../BUILD.md.

For each bundled CSV it builds the profile two ways and requires them to be identical:
  1. the repo:  download.to_parquet() (pyarrow, all-string columns), then profile_pandas()
  2. the demo:  py/demo_driver.run_profile(), the CSV path the page uses in Pyodide
It then prints how the result compares with the committed Spark profile.

    python -I check_equivalence.py --repo <nyc-autoddg checkout> --downloads <dir> --demo <demo dir>

Needs pandas, numpy, pyarrow and requests (download.py imports it) in the interpreter.
"""

import argparse
import collections
import importlib.util
import json
import sys
import tempfile
from pathlib import Path

ap = argparse.ArgumentParser()
ap.add_argument("--repo", type=Path, required=True)
ap.add_argument("--downloads", type=Path, required=True)
ap.add_argument("--demo", type=Path, required=True)
ap.add_argument("--ids", nargs="*", default=["25th-nujf", "wxhr-qbhz", "a4qt-mpr5"])
a = ap.parse_args()

# the repo's autoddg package first; the demo's pyspark shim second (Spark itself isn't needed)
sys.path[:0] = [str(a.repo / "src"), str(a.demo / "py")]
import pandas as pd  # noqa: E402
from autoddg.download import to_parquet  # noqa: E402
from autoddg.profile_pandas import profile_pandas  # noqa: E402

spec = importlib.util.spec_from_file_location("demo_driver", a.demo / "py" / "demo_driver.py")
driver = importlib.util.module_from_spec(spec)
spec.loader.exec_module(driver)

print(f"pandas {pd.__version__}")
ok = True
for ds in a.ids:
    csv_path = a.downloads / f"{ds}.csv"
    with tempfile.TemporaryDirectory() as tmp:
        pq = Path(tmp) / f"{ds}.parquet"
        to_parquet(csv_path, pq)
        repo = json.loads(json.dumps(profile_pandas(pq, ds), default=str))
    demo = json.loads(driver.run_profile(str(csv_path), ds))
    for p in (repo, demo):
        p.pop("profile_seconds")
    same = repo == demo
    ok &= same
    cmp = json.loads(driver.compare(json.dumps(demo), (a.repo / "profiles" / f"{ds}.json").read_text()))
    counts = collections.Counter(r["status"] for r in cmp)
    print(f"{ds}: demo == repo pipeline: {same}; vs committed Spark profile: "
          f"{counts['match']} identical, {counts['approx']} Spark estimates, "
          f"{counts['differs']} differ, of {len(cmp)}")
sys.exit(0 if ok else 1)
