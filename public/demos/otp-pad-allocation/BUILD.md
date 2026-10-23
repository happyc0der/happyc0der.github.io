# One-time-pad allocation demo: how it is built

Served at `/demos/otp-pad-allocation/` and embedded on `/projects/otp-pad-allocation/`.
There is no build step. The page is static files, and the repo's Python runs unmodified
in Pyodide inside a Web Worker.

## Source

- Repo: https://github.com/happyc0der/cryptography-project-1 (public)
- Commit: `662f57872a5fb1b218796362710e281244b4a0c0` (2026-09-14, "Correct the blocked-count
  claim in the README"), the September 2026 chunk-reserve rewrite. Do not use the October 2025
  team version: its code is different, and it has no `protocol.py` or `simulation.py`.
- Licence: the repo has no LICENSE file at this commit, so this demo states no licence for
  the copied files. Keshav prefers GPL-3.0, but he has to confirm before one is added upstream.

## Files

Copied from the repo, byte for byte (`py/`):

| file | sha256 |
|---|---|
| `protocol.py` | `81a20df0e0c9186209a87db0748a9b6e6fd9174ecffdc8df7462f7a2cc25f95b` |
| `simulation.py` | `3b32e592d41a891b4d8fe19cb3dd182bd864827e3aaf12a811029b1d1947a7f1` |
| `eval_protocol.py` | `fe3b6a939376404b6e8e3e8b5772b6d7cbadc6d10160ea26c4ba3407c8c80ee1` |
| `main.py` | `6e1e2740d0da1e1f98b3a90b9317d119661722a7bbaea6b9953943731d8c2607` |
| `test_protocol.py` | `013da6411f866e4b49a733d423d55b122689649d872bd0d7360411b3c7efe44d` |
| `summary.csv` | `e968dd751fa53077ea5e1817d1ce8760db1badff5b956862333ecf8e9d765845` |

`summary.csv` has CRLF line endings upstream, because `csv.DictWriter` writes them.
`py/.gitattributes` marks it `-text` so git never rewrites it, since the CI tab compares
it byte for byte.

Written for the demo:

- `index.html`, `style.css`: the page. It uses `../_shared/demo.css` for the palette.
- `app.js`: draws the state the worker returns and turns clicks and keys into requests.
  It does no protocol logic.
- `worker.js`: a module worker. It takes the pinned Pyodide URL from
  `../_shared/pyodide.js`, writes the `py/` files to `/home/pyodide` and imports `glue`.
  It does not call `startPython()`, because that function adds a `<script>` tag and a worker
  has no document. Running Python off the main thread keeps the 180-row grid and the test
  suite from freezing the page.
- `py/glue.py`: the only Python written for the demo. Its docstring lists everything it adds:
  - `Playground`, which mirrors `main.py`'s `trace()` for moves made by hand, and whose
    `step()` copies the loop body of `simulation.run` statement for statement.
  - `record()`, a copy of the pad-reuse check that `simulation.run` makes.
  - `AlwaysPadOne`, copied from `test_protocol.py`.
  - A progress counter that wraps `eval_protocol.measure` while `eval_protocol.main()` runs.

## Regenerate

From the portfolio repo root:

```sh
git clone https://github.com/happyc0der/cryptography-project-1.git /tmp/otp-src
git -C /tmp/otp-src checkout 662f57872a5fb1b218796362710e281244b4a0c0
cp /tmp/otp-src/{protocol.py,simulation.py,eval_protocol.py,main.py,test_protocol.py,summary.csv} \
   public/demos/otp-pad-allocation/py/
shasum -a 256 public/demos/otp-pad-allocation/py/{protocol.py,simulation.py,eval_protocol.py,main.py,test_protocol.py,summary.csv}
# compare the hashes with the table above
```

If the source moves to a newer commit, update the hashes, the commit in the page footer
(`index.html`), the `demo_label` in `content/projects/otp-pad-allocation.md`, and this file.

## Check it natively (optional)

The glue also runs under plain CPython 3.11 or newer, and the demo uses no packages besides
pytest. Copy the files out, so that no `__pycache__` ends up in `public/`:

```sh
mkdir -p /tmp/otp-check && cp public/demos/otp-pad-allocation/py/* /tmp/otp-check/
cd /tmp/otp-check
python3 -c "import json, glue; r = json.loads(glue.dispatch('ci.slice')); print(r['identical'], 'of', r['total'])"   # 18 of 18
python3 -c "import json, glue; print(json.loads(glue.dispatch('ci.full'))['identical'])"                          # True, about 40 s
```

When this demo was built, a native script also auto-played 1,536 configurations through
`Playground`: four protocols, n and d in (60, 3), (61, 2), (40, 5) and (100, 1), six
schedules, four delivery orders, two pressures and two seeds. Every run matched
`simulation.run` on wasted, sends, blocked and steps, and every `AlwaysPadOne` run raised
the reuse alarm.

## Test it in a browser

```sh
python3 -m http.server 8214 --directory public
# http://127.0.0.1:8214/demos/_shared/frame-test.html?demo=otp-pad-allocation&h=880
# http://127.0.0.1:8214/demos/otp-pad-allocation/
```

Measured in headless Edge 155 on an Apple M4 Pro Mac on 2026-10-23:

| job | result |
|---|---|
| Start Python, first visit | 6.5 s |
| CDN download (Pyodide 0.29.5 core) | 5.32 MB |
| m = 5, d = 5 slice, 18 rows | 18 of 18 byte-identical, 6 s |
| `eval_protocol.main()`, 180 rows | identical to the committed file (SHA-256 e968dd75…), 72 s |
| `pytest -q` | 310 passed in 16 s (pytest 8.3.5 adds 1.63 MB) |
| `main.py --m 5` | exit 0, 0.08 s |

Network: only same-origin requests and `cdn.jsdelivr.net/pyodide/v0.29.5/full/`.

## Credit shown on the page

Copied from the content file's `credit` field:

> NYU CS6903/4783 Project 1 with Aaron Wu and Shuhua. The October 2025 version is the team's
> static-partition baseline. The chunk-reserve protocol, the proofs, the adversarial simulator,
> the tests, CI and the report are from my September 2026 rewrite.

The page also says that `StaticPartitionProtocol` in `protocol.py` is the 2026
re-implementation, not the team's October 2025 code.
