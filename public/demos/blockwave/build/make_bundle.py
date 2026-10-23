"""Copy the BLOCKWAVE modules the demo runs, unchanged, and write the manifest and poster.

    python make_bundle.py <blockwave repo> <demo dir>

* Copies each module in SOURCES from <repo>/src to <demo dir>/py/, byte for byte.
  These are the numpy-only parts of the game and the agent environment; nothing
  that imports torch or (for real) pygame is copied.
* Copies the repo's LICENSE (GPL-3.0-or-later) to <demo dir>/py/LICENSE.
* Copies the two pretrained run configs to <demo dir>/data/.
* Writes <demo dir>/py/manifest.json: the repo commit, every Python file the page
  places in Pyodide's filesystem, and each file's SHA-256.
* Renders poster.jpg with the repo's own Compositor: the board-state agent
  (NumPy forward pass, data/board.npz) 240 decisions into the held-out game.
  Needs Pillow for the JPEG; run export_weights.py first.
"""

from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path

SOURCES = [
    "blockwave/__init__.py",
    "blockwave/core/__init__.py",
    "blockwave/core/board.py",
    "blockwave/core/constants.py",
    "blockwave/core/engine.py",
    "blockwave/core/events.py",
    "blockwave/core/piece.py",
    "blockwave/core/randomizer.py",
    "blockwave/core/rules.py",
    "blockwave/render/__init__.py",
    "blockwave/render/compositor.py",
    "blockwave/render/effects.py",
    "blockwave/render/font.py",
    "blockwave/render/layout.py",
    "blockwave/render/palette.py",
    "blockwave/render/profiles.py",
    "blockwave/app/__init__.py",
    "blockwave/app/input.py",
    "blockwave/app/replay.py",
    "blockwave_rl/__init__.py",
    "blockwave_rl/evaluate.py",
    "blockwave_rl/env/__init__.py",
    "blockwave_rl/env/base.py",
    "blockwave_rl/env/crops.py",
    "blockwave_rl/reward/__init__.py",
    "blockwave_rl/reward/empowerment.py",
    "blockwave_rl/reward/empowerment_env.py",
]
DEMO_FILES = ["demo/__init__.py", "demo/np_policy.py", "demo/driver.py"]


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    repo, demo = Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve()
    commit = subprocess.check_output(["git", "-C", str(repo), "rev-parse", "HEAD"], text=True).strip()
    py = demo / "py"
    for package in ("blockwave", "blockwave_rl"):
        shutil.rmtree(py / package, ignore_errors=True)
    for rel in SOURCES:
        dest = py / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(repo / "src" / rel, dest)
    (py / "demo/__init__.py").write_text("")
    # GPL-3.0-or-later: the licence text travels with the code it covers.
    shutil.copyfile(repo / "LICENSE", py / "LICENSE")
    for run in ("board", "pixel"):
        shutil.copyfile(repo / f"pretrained/{run}/config.json", demo / f"data/{run}_config.json")

    files = SOURCES + DEMO_FILES
    manifest = {
        "repo": "https://github.com/happyc0der/blockwave",
        "commit": commit,
        "repo_files": SOURCES,
        "demo_files": DEMO_FILES,
        "sha256": {rel: sha(py / rel) for rel in files},
    }
    (py / "manifest.json").write_text(json.dumps(manifest, indent=1) + "\n")
    print(f"{len(SOURCES)} repo files at {commit[:7]}, {len(DEMO_FILES)} demo files")

    # Poster: a real frame from the repo's compositor, not a mock-up.
    sys.dont_write_bytecode = True  # keep __pycache__ out of the published py/ tree
    sys.path[:0] = [str(py)]
    import numpy as np
    from PIL import Image

    from blockwave.render.compositor import Compositor
    from blockwave.render.layout import HUMAN_CELL_PX, Layout
    from blockwave_rl.evaluate import EVAL_SEED
    from blockwave_rl.reward.empowerment_env import EmpowermentEnv
    from demo.np_policy import NumpyBoardPolicy, sample

    config = json.loads((demo / "data/board_config.json").read_text())
    env = EmpowermentEnv(horizon=config["horizon"], agent_hz=config["agent_hz"], gravity_scale=config["gravity"])
    policy = NumpyBoardPolicy((demo / "data/board.npz").read_bytes())
    rng = np.random.default_rng(EVAL_SEED)
    grid, queue = env.reset(seed=EVAL_SEED)
    for _ in range(240):
        step = env.step(sample(policy.forward(grid, queue)[0], rng))
        grid, queue = step.grid, step.queue
    frame = Compositor(Layout(HUMAN_CELL_PX), "arcade").render(env.env.engine)
    Image.fromarray(frame).save(demo / "poster.jpg", quality=82, optimize=True, progressive=True)
    print(f"poster.jpg {frame.shape[1]}x{frame.shape[0]}, {env.env.engine.stats.pieces_placed} pieces in")


if __name__ == "__main__":
    main()
