# Bandits demo: how it is built

Static files, no build step. The page runs the repo's own Python in Pyodide inside a Web
Worker; JavaScript only lays out the numbers and draws the charts.

Source: https://github.com/happyc0der/multi_armed_bandit_algorithms at commit
`2be15abf09b4642bd93454bc4e0280d66d580f63` (2be15ab, "Tidy reporting edge cases and remove
dead code"). The repo has no LICENSE file at that commit; it is Keshav's own code.

| file | what it is |
|---|---|
| `py/**` | 12 files from the repo, byte-for-byte at 2be15ab (hashes below) |
| `demo_entry.py` | glue written for this page: picks a case, calls the repo's functions, returns JSON |
| `worker.js` | loads Pyodide and NumPy, writes `py/**` and `demo_entry.py` into its file system, answers the page |
| `app.js`, `app.css`, `index.html` | page, layout and canvas charts |

Runtime: Pyodide 0.29.5 (Python 3.13.2, NumPy 2.2.5) from
`https://cdn.jsdelivr.net/pyodide/v0.29.5/full/`, pinned once in `../_shared/pyodide.js`.
The worker imports only that file's constants, because its `startPython()` needs `document`.
No other network: everything else is same-origin.

## Regenerate `py/`

```zsh
git clone https://github.com/happyc0der/multi_armed_bandit_algorithms.git /tmp/mab
cd /tmp/mab
REV=2be15abf09b4642bd93454bc4e0280d66d580f63
D=<portfolio>/public/demos/bandits/py
mkdir -p $D/bench
for f in bandit_base.py synthetic_env.py ucb1.py epsilon_greedy.py mucb.py ts_ge.py \
         fast_adswitch.py bench/__init__.py bench/cases.py bench/metrics.py \
         bench/preflight.py bench/runner.py; do
  git show $REV:$f > $D/$f
done
cd $D && shasum -a 256 *.py bench/*.py
```

Expected SHA-256:

```
4553cab47ed828f1bfce4efca9960ba6cbf8b14bcad7a4e7291a505c2ec2f133  bandit_base.py
957c242b6273bf84cec0c5f6ff18b1b964be9c992460bcbe64a5cf4714957f76  epsilon_greedy.py
300ad6672a2917249e5c22aa864e2c2f09820a401d54b0ab5d4cc79677e9da41  fast_adswitch.py
7c448533ef39f0af7176dcdc5e4387ae9c55b874bcc232c72018bf7cb5e9e441  mucb.py
27aa68d16f76818e80a16e73f2030c46c5a613e48812922ffb656b373374cd3c  synthetic_env.py
ba9239e8c760c4a4e16212cf19ee7219208fe69a51cb1b15bd0bdc9e6ebddf16  ts_ge.py
b389e90562f0a266f5a98ca7c0a6bd782493504ddde89e6bfa20107863438f6f  ucb1.py
59d0f181bff1a2992c9d0ed72208eed6ff8f2884d2f26970a4af4f2f0e0679e6  bench/__init__.py
ea0505fa2c91d7f1bc2c981524c3ddab491f8c281cd1f527dd4439ce4819d049  bench/cases.py
82077e40c95556bcfb39c2198ab5fafb2b333d3f4d6e12eb5446351c3d6bf100  bench/metrics.py
025994a534b9882b598a083a6cfb3f80ce92e05618c83c8e78ebfba5b6d65223  bench/preflight.py
ab1fb07d817d7970665f3dfea15a59d4460554e40d516e9100d9dd737f3fe3c7  bench/runner.py
```

`matplotlib` is not loaded: `bench/runner.py` imports it only inside `plot_case()`, which the
demo never calls. `test_algorithms.py`, `test_fast_adswitch.py`, `legacy_implementation/` and
`docs/` (the two papers) are not shipped.

## What the glue calls

- `bench.cases.get_case` for `case1_K2_baseline` and `case5_best_arm_collapse` (case2 to
  case4 take minutes to hours and are not offered).
- `bench.preflight.preflight` before every run; any ERROR refuses the run, as
  `test_algorithms.py` does without `--no-preflight`. The TS-GE delta field feeds it.
- `bench.runner.run_trial(case, [name], seed, keep_histories=True)` for each algorithm.
  For "TS-GE as printed", which `run_trial` has no hook for, it repeats `run_trial`'s four
  calls (`build_algorithms` factory, `_make_env`, `.run`, `summarize_run`) after setting the
  instance's `reproduce_paper_beta_typo = True`, which `TS_GE` reads only in `run()`.
- `bench.metrics.downsample_cumulative` / `downsample_x` (600 points) for the curves, and
  `bench.metrics.dispersion` for the README check.
- The README figures (174 / 21,860 at case1 seed 42, the seed-1 phase table, and the 20-seed
  regression table) are constants in `demo_entry.py`, used only to say "same as" or
  "differs from" next to live numbers.

## Check the numbers natively

From `public/demos/bandits/` (`-B` keeps `__pycache__` out of `public/`):

```zsh
uv run --no-project --python 3.13 --with numpy==2.2.5 python -B -c '
import sys, json; sys.path[:0] = ["py", "."]
import demo_entry as d
print(round(json.loads(d.run_one("case1", "TS-GE", 42))["phase_regret"]["TS"]["regret"]),
      round(json.loads(d.run_one("case1", "TS-GE", 42, paper_beta_typo=True))["phase_regret"]["TS"]["regret"]))
d.regression_reset()
for s in d.REGRESSION_SEEDS: d.regression_seed(s)
print({k: v["matches"] for k, v in json.loads(d.regression_summary()).items()})'
```

Prints `174 21860` and `True` for all five algorithms.

## Measured on 2026-10-23

Headless Edge on an Apple Silicon Mac, served by `python3 -m http.server` from `public/`:

- Cold start (download + import): 6 to 12 s. Transfer from the CDN is about 8.1 MB compressed
  (pyodide.asm.wasm 2.67 MB, python_stdlib.zip 2.39 MB, NumPy wheel 2.80 MB, pyodide.asm.js
  0.23 MB, lock file and loader 0.03 MB).
- case1, all five algorithms: 0.6 s. case5, all five: 16.8 s (AdSwitch 10.9 s of it).
- The 20-seed README check: 11.8 s; mean, std, min and max match the README to six
  decimals for all five algorithms, so NumPy's RNG stream in WebAssembly matches native.
- case1 seed 42 TS-phase regret: 174 corrected, 21,860 as printed, same as the README.
