# Hawk demo: how this folder is built

The demo runs the Python from
[happyc0der/hawk-signature-study](https://github.com/happyc0der/hawk-signature-study) at commit
`61a3dfab6fb056ae2f42e577fcda12c53d65835f` (2026-09-25, "Add screenshots") in Pyodide 0.29.5,
inside a module Web Worker. There is no build step for the page itself; only `repo/` and
`manifest.json` are generated.

## Files

| Path | Origin |
|---|---|
| `repo/hawk_crypto/**`, `repo/tests/test_hawk.py` | Copied byte for byte from the repo at the commit above |
| `repo/LICENSE.txt` | The repo's `LICENSE` (MIT, with the hawk-py MIT notice), renamed so static hosts serve it as text |
| `manifest.json` | List of the `.py` files the worker loads, plus the source commit |
| `glue.py` | Written for this page. Stands in for `app.py` (Flask, which cannot run in a browser): base64 in and out, messages as UTF-8 `np.frombuffer(..., uint8)`, direct calls to `hawkkeygen`, `hawksign`, `hawkverify`, and `pytest.main` for the repo's tests |
| `worker.js` | Loads Pyodide (version and URL from `../_shared/pyodide.js`), NumPy and SymPy, writes the repo files under `/home/pyodide`, imports `hawk_crypto` and answers calls from the page |
| `demo.js`, `index.html` | The page; uses `../_shared/demo.css` |

Nothing here is modified from the repo. `app.py` and `web/demo.html` are not used: that page is a
front end for the Flask JSON API and needs the server running.

## Regenerate

From the portfolio repo root (zsh or bash):

```sh
SRC=$(mktemp -d)/hawk-signature-study
git clone https://github.com/happyc0der/hawk-signature-study "$SRC"
git -C "$SRC" checkout 61a3dfab6fb056ae2f42e577fcda12c53d65835f

D=public/demos/hawk-signature-study
rm -rf "$D/repo" && mkdir -p "$D/repo"
git -C "$SRC" archive 61a3dfab6fb056ae2f42e577fcda12c53d65835f hawk_crypto tests/test_hawk.py LICENSE | tar -x -C "$D/repo"
mv "$D/repo/LICENSE" "$D/repo/LICENSE.txt"

(cd "$D" && python3 - <<'EOF'
import json, os
files = sorted(os.path.relpath(os.path.join(r, f), 'repo')
               for r, _, fs in os.walk('repo') for f in fs if f.endswith('.py'))
m = {"source": "https://github.com/happyc0der/hawk-signature-study",
     "commit": "61a3dfab6fb056ae2f42e577fcda12c53d65835f", "files": files}
with open('manifest.json', 'w') as fh:
    json.dump(m, fh, indent=2)
    fh.write('\n')
EOF
)
```

To move to a newer commit, use its hash in the three places above, then update the commit link
and the short hash in the footer of `index.html`.

Check that the copies are untouched:

```sh
T=$(mktemp -d)
git -C "$SRC" archive 61a3dfab6fb056ae2f42e577fcda12c53d65835f hawk_crypto tests/test_hawk.py LICENSE | tar -x -C "$T"
mv "$T/LICENSE" "$T/LICENSE.txt"
diff -r "$T" public/demos/hawk-signature-study/repo && echo identical
```

## Run locally

```sh
python3 -m http.server 8211 --directory public
# http://127.0.0.1:8211/demos/hawk-signature-study/
# http://127.0.0.1:8211/demos/_shared/frame-test.html?demo=hawk-signature-study&h=900
```

## Network and size

- Same-origin: this folder (about 0.2 MB) and `../_shared/`.
- `https://cdn.jsdelivr.net/pyodide/v0.29.5/full/` only: `pyodide.mjs`, `pyodide.asm.js`,
  `pyodide.asm.wasm`, `python_stdlib.zip`, `pyodide-lock.json`, and the NumPy 2.2.5, SymPy 1.13.3
  and mpmath 1.3.0 wheels. Measured cold in headless Edge: 12.7 MB transferred, ready in about 7 s.
  SymPy is about 4.5 MB of that and is needed only for `sympy.ntheory.primitive_root` in
  `hawk_crypto/poly.py`; it is loaded as is rather than stubbed, so the code runs unmodified.
- "Run pytest" adds pytest 8.3.5 and its dependencies from the same CDN path, about 1.6 MB.
- Nothing loads until the visitor presses Start.

## Tested (2026-10-23, headless Edge 155, macOS)

- Hawk-256, -512 and -1024 key generation, signing and verification; encoded sizes 96/450/249,
  184/1024/555 and 360/2440/1221 bytes, matching `params.py`.
- Every tamper control rejects; 64 random signatures are rejected without raising.
- `tests/test_hawk.py`: 16 passed in Pyodide (4 to 25 s depending on machine load).
- 360 and 1400 px iframes, keyboard only, `prefers-reduced-motion: reduce`, no console errors.
