# BLOCKWAVE live demo: how it is built

Source repo: https://github.com/happyc0der/blockwave at commit
`7fcee415fd0e6c5e3eb90da2ef9bef5dd41a7eda` (GPL-3.0-or-later).

## What runs in the browser

| Part | What it is |
|---|---|
| `py/blockwave/**`, `py/blockwave_rl/**` | 27 modules copied **unchanged** from the repo's `src/`: the engine and rules (`core/`), the NumPy compositor (`render/`), the DAS/ARR key handler and `apply_tick` (`app/input.py`, `app/replay.py`), the agent environments (`env/base.py`, `env/crops.py`), the empowerment reward (`reward/`) and `evaluate.EVAL_SEED`. `py/manifest.json` lists them with SHA-256s. Nothing that imports torch is shipped. |
| `py/demo/np_policy.py` | Written for the demo. A NumPy re-implementation of `BoardPolicy` and `PixelPolicy` from `src/blockwave_rl/agents/nets.py`, plus softmax sampling (sampled, not argmax, as `evaluate.checkpoint_actor` acts). |
| `py/demo/driver.py` | Written for the demo. The loops of `blockwave_rl/watch.py` and `blockwave_rl/world/watch_pixel.py`, one call per decision, and a Play loop at the game's 240 Hz fixed timestep. It puts a stand-in `pygame` module (key-constant integers only) in `sys.modules` so the repo's `app/input.py` imports unchanged; pygame itself never runs. |
| `data/board.npz`, `data/pixel.npz` | The `state_dict`s of `pretrained/board/policy.pt` (150M-step board-state run, 1.01M parameters) and `pretrained/pixel/policy.pt` (50M-step pixel run, 1.69M parameters), float32, exported once with torch. |
| `data/parity_*.npz` | 200 observations each from the repo's own environments, starting at `EVAL_SEED`, with the logits torch produced for them. The page re-runs them through the NumPy forward pass on load and prints the maximum difference. |
| `data/*_config.json` | `pretrained/{board,pixel}/config.json`, copied. The page reads `horizon`, `agent_hz`, `gravity` and `frame_stack` from them. |
| `poster.jpg` | One frame from the repo's `Compositor` (arcade profile, 30 px cells): the board-state agent 240 decisions into the held-out game. |
| `index.html`, `style.css`, `app.js` | The page. Pyodide 0.29.5 and its NumPy 2.2.5 come from `cdn.jsdelivr.net/pyodide/v0.29.5/full/` through `../_shared/pyodide.js`; nothing else leaves the origin. |

Not in the demo: sound, screen shake, particles and the title/pause scenes (they live in
`app/main.py`, which needs real pygame); the VAE and world model (`pretrained/pixel/vae.pt`,
`world.pt`), which are training-time only. The results chart repeats the README's table
(README.md, "How the agent is doing") and is labelled as such.

## Regenerate

Run from anywhere; `DEMO` is this directory. torch is needed once, offline, and never in the
browser. On macOS arm64 the PyPI torch wheel is CPU/MPS; on Linux add
`--index-url https://download.pytorch.org/whl/cpu` to the torch install.

```sh
WORK=$(mktemp -d)
DEMO=/path/to/portfolio/public/demos/blockwave

git clone https://github.com/happyc0der/blockwave.git "$WORK/blockwave"
git -C "$WORK/blockwave" checkout 7fcee415fd0e6c5e3eb90da2ef9bef5dd41a7eda

uv venv --python 3.13 "$WORK/venv"
VIRTUAL_ENV="$WORK/venv" uv pip install --python "$WORK/venv/bin/python" \
  torch==2.9.1 numpy==2.2.5 pillow==11.3.0

# 1. Weights and parity data (needs torch and the repo's src/ on the path).
PYTHONPATH="$WORK/blockwave/src" "$WORK/venv/bin/python" "$DEMO/build/export_weights.py" \
  "$WORK/blockwave" "$DEMO/data"

# 2. Copy the repo modules, LICENSE and run configs, write py/manifest.json, render poster.jpg.
"$WORK/venv/bin/python" "$DEMO/build/make_bundle.py" "$WORK/blockwave" "$DEMO"
```

Running both steps twice gave byte-identical `board.npz`, `pixel.npz`, `parity_*.npz` and
`poster.jpg` (2026-10-23, Python 3.13.15, torch 2.9.1, NumPy 2.2.5, Pillow 11.3.0).

## Checks done on 2026-10-23

- NumPy vs torch logits, native NumPy 2.2.5: max |Δ| 1.9e-6 (board, 200 states) and 1.9e-5
  (pixel, 200 frame stacks). In Pyodide 0.29.5 in headless Edge 155: 2.7e-6 and 1.9e-5.
- Behaviour, natively, with the NumPy policy and the repo's environment from `EVAL_SEED`:
  board agent 0.156 lines per piece over 8 complete games (README: 0.1629); pixel agent 0.110
  over 6 games (README: 0.0941). In the browser, one complete board-agent game: 62 pieces,
  9 lines.
- Headless Edge 155 on an M-series Mac: arcade frame about 13-18 ms, flat 7-10 ms, so the page
  stays on the arcade profile and sustains 8x (40 decisions/s). At 6x CPU throttling the
  arcade frame took 89 ms and the page switched itself to flat, saying so.
- Network: same origin plus `cdn.jsdelivr.net/pyodide/v0.29.5/` only (6 files, 8.1 MB with
  brotli). First start fetches 4.3 MB from the site; the pixel tab adds 6.8 MB.
