# Ledger demo: how it is built

`/demos/ledger/` runs the verification layer of [happyc0der/ledger](https://github.com/happyc0der/ledger)
at commit `617c985371ec21e90d36d5d190ff4186feccd471` in Pyodide 0.29.5 (pandas 2.3.3), over the claim
ledgers Claude Sonnet 5.5 returned in the recorded event-day run of 2026-10-17. Nothing is compiled;
the files are copied and served as they are. No model is called: `py/ledger/llm.py` is a stub that raises.

## What is in this folder

| path | what it is | origin |
|---|---|---|
| `index.html`, `app.js`, `app.css` | the page (deal browser, scoreboard, forecast) | written for the demo |
| `py/ledger_demo.py` | bridge: loads the recorded run, calls the repo's functions, returns JSON | written for the demo |
| `py/ledger/{__init__,config,data,attribution,tools,rules,consistency,claims,redact,score_issues,forecast,evaluate}.py` | the repo's modules | copied unchanged from `ledger/` at 617c985 |
| `py/ledger/llm.py` | stub: raises if anything asks for a model call | written for the demo (replaces the repo's `ledger/llm.py`) |
| `py/dotenv/__init__.py` | stub for python-dotenv (`load_dotenv` does nothing) | written for the demo |
| `py/LICENSE` | GPL-3.0 text | copied from the repo |
| `data/company_nicrron/*.csv`, `company.md`, `profile.json` | the 235-deal company and its planted-anomaly and outcome labels | `data/company/` at 617c985 (byte-identical to the local `data/company_nicrron/` the event run used) |
| `runs/company_nicrron/v3.jsonl` | Ledger v3, Claude Sonnet 5.5, 2026-10-17 | recorded run, not in git; PRISM trace and trajectory ids removed, nothing else changed |
| `runs/company_nicrron/naive.jsonl` | the naive "list the issues" agent, same model and day | recorded run, not in git; byte-identical copy |
| `runs/company_nicrron/v1.jsonl` | the naive v1 forecaster, same model and day | recorded run, not in git; byte-identical copy |

Left out on purpose: `history.csv` and `activities_original.csv` (not read by these modules), the
agents, the store, the FastAPI app, PRISM tracing and every provider client.

In Pyodide the files are written to `/home/pyodide/` with the same layout as the repo
(`ledger/`, `data/company_nicrron/`, `runs/company_nicrron/`), and `LEDGER_DATA` is set to
`/home/pyodide/data/company_nicrron` before `ledger.config` is imported, so `RUNS_DIR` resolves to
`/home/pyodide/runs/company_nicrron` exactly as `config.py` computes it.

## Regenerate

Run from the portfolio repo root. `RUNS` must point at a copy of the recorded run directory
(`~/Projects/ledger/runs/company_nicrron/` on the author's machine; `runs/` is gitignored in the repo).

```bash
set -euo pipefail
D=public/demos/ledger
SRC=$(mktemp -d)/ledger
RUNS=~/Projects/ledger/runs/company_nicrron

git clone https://github.com/happyc0der/ledger.git "$SRC"
git -C "$SRC" checkout 617c985371ec21e90d36d5d190ff4186feccd471

mkdir -p $D/py/ledger $D/data/company_nicrron $D/runs/company_nicrron
for m in __init__ config data attribution tools rules consistency claims redact score_issues forecast evaluate; do
  cp "$SRC/ledger/$m.py" $D/py/ledger/
done
cp "$SRC/LICENSE" $D/py/LICENSE
for f in accounts.csv activities.csv anomalies.csv company.md contacts.csv deals.csv ground_truth.csv products.csv profile.json team.csv; do
  cp "$SRC/data/company/$f" $D/data/company_nicrron/
done

python3 - "$RUNS" $D/runs/company_nicrron <<'EOF'
import json, sys
src, out = sys.argv[1], sys.argv[2]
for v in ("v3", "naive", "v1"):
    rows = [json.loads(l) for l in open(f"{src}/{v}.jsonl") if l.strip()]
    with open(f"{out}/{v}.jsonl", "w") as f:
        for r in rows:
            r.pop("prism_trace_ids", None); r.pop("prism_trajectory_id", None)  # links into a private dashboard
            f.write(json.dumps(r) + "\n")
EOF

shasum -a 256 $D/runs/company_nicrron/*.jsonl
```

Expected checksums:

```
21e30f0033644469057af799d498937726193635e77d564ceb94abd26c4cf9cf  runs/company_nicrron/naive.jsonl
5236ea212d19ac9b4dcef07ec5604133ca3bdcdd47c4ccf244712f292bbe2a07  runs/company_nicrron/v1.jsonl
3c59e3ae5e64ae76593d7704764545d0b954f4e1f0c8f59f14eb536c72d69410  runs/company_nicrron/v3.jsonl
```

(The untouched recorded `v3.jsonl` is `58aa8299…9a42`; `naive.jsonl` and `v1.jsonl` are unchanged.)
`py/ledger_demo.py`, `py/ledger/llm.py`, `py/dotenv/__init__.py` and the page files are kept in this folder;
they are not generated.

## Check the numbers outside the browser

The same bridge runs under CPython with pandas, which is how the numbers were first checked:

```bash
T=$(mktemp -d); cp -R $D/py/ledger $D/py/dotenv $D/py/ledger_demo.py $D/data $D/runs "$T"/
cd "$T" && LEDGER_DATA="$T/data/company_nicrron" python3 -c '
import json, ledger_demo as L
L.step_load(); print(L.step_recompute())
s = json.loads(L.step_score()); e = json.loads(L.step_evaluate())
for k in ("rules", "naive", "v3_day"):
    print(k, s[k]["semantic"], s[k]["clean_flagged"], "of", s[k]["clean_deals"])
print("fabrications v1/v3:", e["v1"]["fabrications"], e["v3"]["fabrications"])'
```

Expected: 238 findings recomputed, identical to the 238 recorded; Ledger semantic recall 0.939 and
precision 0.988 with 0 of 86 clean deals flagged; naive recall 0.721, precision 0.872, 10 of 86;
fabrications 6 (v1) and 0 (v3). These match `docs/reports/issues_sonnet.md` and
`docs/reports/v1_v3_sonnet.md` at 617c985. Checked with pandas 3.0.2 (CPython) and 2.3.3 (Pyodide).

## Test

```bash
python3 -m http.server 8207 --directory public
# then open http://127.0.0.1:8207/demos/_shared/frame-test.html?demo=ledger&h=760
```
