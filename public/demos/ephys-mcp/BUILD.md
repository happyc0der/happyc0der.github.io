# ephys-mcp demo: how it is built

A tool console for [happyc0der/ephys-mcp](https://github.com/happyc0der/ephys-mcp). The page loads
Pyodide in a Web Worker, unpacks the repo's package and calls the tool functions that `server.py`
registers, the way an MCP client's `tools/call` would reach them. There is no MCP transport and no
language model; the visitor presses the buttons. All data comes from the server's synthetic source.

## Source pin

- Repo: https://github.com/happyc0der/ephys-mcp
- Tag `v0.5.1` = commit `7275320b07c7ded15a1c7873bc0061181b1cc8c3`. The current default branch head,
  `84e76f1`, only adds README screenshots; `src/` and `tests/` are identical.
- Licence: CC0-1.0 (the repo's `LICENSE` is inside the zip).

## Regenerate `ephys-mcp-v0.5.1.zip`

```sh
git clone https://github.com/happyc0der/ephys-mcp.git /tmp/ephys-mcp
cd /tmp/ephys-mcp
git archive --format=zip --prefix=ephys-mcp/ -o ephys-mcp-v0.5.1.zip v0.5.1 \
  src/ephys_mcp tests/test_core.py tests/test_psth_plots.py tests/test_cross_session.py \
  tests/test_latent.py tests/test_geometry.py LICENSE
shasum -a 256 ephys-mcp-v0.5.1.zip
# fa6fa43b0031bc40a9049b8de05d20eed037b047bd4e96a3ed7b04718be45b32 with git 2.51.0
cp ephys-mcp-v0.5.1.zip <portfolio>/public/demos/ephys-mcp/
```

The zip holds the package and five offline test files exactly as tagged. Nothing in it is edited.
A different git version may produce different zip bytes with the same contents; compare with
`unzip -l` or by extracting.

## Files

| File | What it is |
|---|---|
| `ephys-mcp-v0.5.1.zip` | The repo's `src/ephys_mcp`, five test files and `LICENSE` at the tag (62 KB) |
| `index.html` | Page, styles and poster |
| `app.js` | Builds each tool's form from the signature the server reports, sends calls, shows results, call log, analyze_session replay, self-check, Stop |
| `charts.js` | SVG figures drawn from the arrays the plot tools pass to `plots.py` |
| `worker.js` | Loads Pyodide 0.29.5 (version and URL from `../_shared/pyodide.js`), NumPy, SciPy, unpacks the zip, runs calls |
| `py/bridge.py` | Demo glue: imports `ephys_mcp.server`, describes the registered tools, calls them, returns JSON and timing |
| `py/mcp/**` | Demo glue: stand-in for the `mcp` SDK (decorators that record tools and return the function unchanged, `Image`, `ToolError`) |
| `py/httpx/__init__.py` | Demo glue: stand-in for httpx with `HTTPError`; creating a client raises, so the DANDI paths fail with the server's own readable error and nothing reaches the network |
| `py/plots_capture.py` | Demo glue: installed as `ephys_mcp.plots` so matplotlib (about 10 MB more) is never loaded; it keeps the arrays each plot function receives |
| `py/selfcheck.py` | Demo glue: runs the repo's tests with pytest in the browser |

The shared loader `../_shared/pyodide.js` injects a `<script>`, which a worker cannot do, so
`worker.js` imports only its pinned `PYODIDE_URL` and loads `pyodide.mjs` from the same URL. The big
files (wasm, stdlib, wheels) therefore share the browser cache with the other Python demos.

## Differences from running the server natively

1. **MCP SDK, httpx, matplotlib**: replaced by the stand-ins above. The plot tools run unchanged;
   only the final drawing moves from matplotlib to SVG in `charts.js`, using the same panels and the
   same derived values (trial subset drawn, heatmap row order and colour limit, unrecorded spans).
2. **One NumPy shim** (`py/bridge.py`): Pyodide is 32-bit WebAssembly, so `np.intp` is int32 and
   `np.repeat` refuses the int64 counts that `rng.poisson` returns in `sources/synthetic.py`
   (`TypeError: Cannot cast array data from dtype('int64') to dtype('int32') according to the rule
   'safe'`, which the server reports as "bad params" for every synthetic session). The shim casts
   such counts to `intp` after checking they fit. It never triggers on 64-bit platforms. A fix in the
   repo would be `np.repeat(np.arange(n), counts[:, u].astype(np.intp))` in `SyntheticSource.__init__`.
3. **Tools switched off in the page**: `sort_spikes` (needs spikeinterface), `list_dataset_files`
   (DANDI API), `list_lsl_streams` and `get_stream_status` (pylsl and a live stream).
   `search_datasets` runs with an empty query only, which returns the built-in curated list offline.
   In `open_session`, the `nwb`, `wav_dir`, `dandi` and `lsl` sources are disabled; `n1_stub` is
   selectable and returns the server's own NotImplementedError message.
4. **Slider caps**: the page limits the synthetic source to 4–96 units and 30–600 s so calls stay
   quick; the server accepts 1–1024 units and 1–3600 s.
5. **One page default that differs from the server's**: `evaluate_cross_session` is pre-filled
   with `bin_s=0.05` (fit_decoder's default bin) instead of the server's 0.02, and the call line
   shows it. At 0.02 with 32 units the ridge design matrix has 801 columns (25 history bins x 32
   units + 1), and Pyodide's NumPy has no optimised BLAS, so the call takes minutes (see timings).
   The visitor can type 0.02 back in.
6. **Stop**: after a call has run for a second, a Stop button appears. Python cannot be
   interrupted inside a NumPy call, and Pyodide's interrupt buffer needs a cross-origin-isolated
   page (GitHub Pages sends no COOP/COEP headers), so Stop terminates the worker and starts a new
   one from the browser cache (about 2.5 s in desktop Edge). Open sessions and fitted decoders are
   lost, and the page says so. The self-check has its own Stop, shown only while the tests run.

So 20 of the 24 tools can be called: the four in item 3 are listed with the reason they are off.

## Self-check

The "Run the tests" button loads pytest 8.3.5 from the Pyodide distribution (about 1.6 MB) and runs
`tests/test_core.py`, `test_psth_plots.py`, `test_cross_session.py`, `test_latent.py` and
`test_geometry.py`. Measured in headless Edge on 2026-10-23: 20 passed, 0 failed, in about 51 s.
`test_geometry.py` skips itself at import without spikeinterface, as it does anywhere without the
`sort` extra. Two tests are deselected because they check what the page replaces:
`test_core.py::test_tools_are_registered` (awaits the MCP SDK's `list_tools()`) and
`test_psth_plots.py::test_plots_return_summary_and_png` (reads PNG bytes).

## Sizes (measured 2026-10-23, cold cache, headless Edge)

- Same origin: about 160 KB (page, scripts, glue, zip).
- cdn.jsdelivr.net/pyodide/v0.29.5/full/: 24.4 MB transferred (wasm 2.7 MB, stdlib 2.4 MB, NumPy
  2.8 MB, SciPy 16.3 MB, loader and lock file 0.26 MB); 30.4 MB decoded. Nothing loads before Start.
- Self-check adds 1.6 MB (pytest and its dependencies).

## Timings (desktop headless Edge on an Apple-silicon Mac, 2026-10-23)

Default synthetic sessions (32 units, 120 s; the test session has noise 2.0). "Native" is the same
tag on 64-bit CPython with NumPy 2.4.6 and SciPy 1.18.0, one BLAS thread.

| Call | Browser | Native |
|---|---|---|
| `fit_decoder` kalman (default), bin 0.05 | 0.19 s | 0.07 s |
| `fit_decoder` ridge, bin 0.05 | 3.8 s | 0.04 s |
| `evaluate_cross_session` ridge, bin 0.02 (server default) | 178 s (235 s in a run through the page's UI) | 0.79 s |
| `evaluate_cross_session` ridge, bin 0.05 (page default) | 8.7 s | 0.07 s |
| `evaluate_cross_session` kalman, bin 0.02 | 0.95 s | 0.43 s |
| `fit_latent_factors` gpfa, defaults (29 EM iterations of at most 60) | 18.5 s | 2.1 s |
| `fit_latent_factors` pca, defaults | 0.04 s | 0.02 s |

`evaluate_cross_session` only cross-validates inside the training session (`_select` in
`processing/decode.py`, run once for the 80/20 same-session check and once for the full fit); the
test sessions are scored with the fitted model unchanged.

With default parameters (32 units, 120 s, seed 0) the analyze_session replay gives, in this
browser: Kalman held-out R² 0.809, ridge 0.866, GPFA top-2 shared variance 0.906 and top-2 to
velocity R² 0.931. The page shows live numbers only; it does not quote the README's figures, which
come from other datasets or parameters. The README does not give the settings behind its simulator figures
(GPFA-to-velocity R² 0.95, PCA 0.68). The repo's own test session (24 units, 240 s, seed 4,
`group_by="direction"`) gives GPFA 0.95 but PCA 0.65, in the browser and natively, so it is not
that run either. The project page states the README figures and the demo default (0.93, 0.62).

## Test locally

```sh
python3 -m http.server 8210 --directory <portfolio>/public
# http://127.0.0.1:8210/demos/ephys-mcp/
# http://127.0.0.1:8210/demos/_shared/frame-test.html?demo=ephys-mcp&h=760
```
