"""Export BLOCKWAVE's pretrained policies to .npz and record torch parity data.

Run once, offline, with torch installed and the BLOCKWAVE repo's src/ on the path
(see ../BUILD.md for the exact commands). torch is never used in the browser.

Writes into the output directory:
    board.npz          BoardPolicy state_dict from pretrained/board/policy.pt, float32
    pixel.npz          PixelPolicy state_dict from pretrained/pixel/policy.pt, float32
    parity_board.npz   200 (grid, queue) observations from EmpowermentEnv and the
                       logits torch's BoardPolicy produced for each
    parity_pixel.npz   the 88x88 crops of a 200-decision pixel-agent game (stack i is
                       frames[i:i+4]) and the logits torch's PixelPolicy produced

The observations come from the repo's own environments, configured as the repo's
watch tools configure them (agent_hz, gravity, horizon and frame stack read from
each checkpoint's config.json), starting from evaluate.EVAL_SEED.

    python export_weights.py <blockwave repo> <output dir>
"""

from __future__ import annotations

import json
import sys
from collections import deque
from pathlib import Path

import numpy as np
import torch

from blockwave_rl.agents.nets import BoardPolicy, PixelPolicy
from blockwave_rl.env.base import N_ACTIONS, BlockwaveEnv, EnvConfig, ObsMode
from blockwave_rl.env.crops import Variant
from blockwave_rl.evaluate import EVAL_SEED
from blockwave_rl.reward.empowerment_env import N_PIECES, EmpowermentEnv

PARITY_STEPS = 200


def state(policy: torch.nn.Module) -> dict[str, np.ndarray]:
    return {k: v.detach().cpu().numpy().astype(np.float32) for k, v in policy.state_dict().items()}


def board(repo: Path, out: Path) -> None:
    ckpt = repo / "pretrained/board/policy.pt"
    config = json.loads((ckpt.parent / "config.json").read_text())
    horizon = config["horizon"]
    policy = BoardPolicy((2, 24, 10), horizon * N_PIECES, N_ACTIONS)
    policy.load_state_dict(torch.load(ckpt, map_location="cpu"))
    policy.eval()
    np.savez(out / "board.npz", **state(policy))

    env = EmpowermentEnv(horizon=horizon, agent_hz=config["agent_hz"], gravity_scale=config["gravity"])
    torch.manual_seed(EVAL_SEED)
    grid, queue = env.reset(seed=EVAL_SEED)
    grids, queues, logits = [], [], []
    with torch.no_grad():
        for _ in range(PARITY_STEPS):
            g, q = torch.as_tensor(grid[None]), torch.as_tensor(queue[None])
            lg, _ = policy(g, q)
            action = torch.distributions.Categorical(logits=lg).sample()
            grids.append(grid.astype(np.uint8))
            queues.append(queue.astype(np.uint8))
            logits.append(lg[0].numpy())
            step = env.step(int(action[0]))
            grid, queue = step.grid, step.queue
    np.savez_compressed(
        out / "parity_board.npz",
        grid=np.stack(grids), queue=np.stack(queues), logits=np.stack(logits).astype(np.float32),
    )
    print(f"board: {sum(v.size for v in state(policy).values())} params, {PARITY_STEPS} parity states")


def pixel(repo: Path, out: Path) -> None:
    ckpt = repo / "pretrained/pixel/policy.pt"
    config = json.loads((ckpt.parent / "config.json").read_text())
    stack_size = int(config.get("frame_stack", 4))
    policy = PixelPolicy((stack_size, 88, 88), N_ACTIONS)
    policy.load_state_dict(torch.load(ckpt, map_location="cpu"))
    policy.eval()
    np.savez(out / "pixel.npz", **state(policy))

    # The same environment watch_pixel.open_session builds.
    env = BlockwaveEnv(
        EnvConfig(
            obs_mode=ObsMode.PIXELS, variant=Variant.BOARD_PLUS_PREVIEW, cell_px=4,
            agent_hz=float(config.get("agent_hz", 5.0)), gravity_scale=float(config.get("gravity", 4.0)),
            frame_stack=1,
        )
    )
    env.reset(seed=EVAL_SEED)
    torch.manual_seed(EVAL_SEED)
    first = env._pixels()
    frames = [first] * stack_size
    stack = deque(frames, maxlen=stack_size)
    logits = []
    with torch.no_grad():
        for _ in range(PARITY_STEPS):
            lg, _ = policy(torch.as_tensor(np.stack(tuple(stack))[None]))
            action = torch.distributions.Categorical(logits=lg).sample()
            logits.append(lg[0].numpy())
            env.step(int(action[0]))
            current = env._pixels()
            stack.append(current)
            frames.append(current)
    np.savez_compressed(
        out / "parity_pixel.npz",
        frames=np.stack(frames[: PARITY_STEPS + stack_size - 1]), logits=np.stack(logits).astype(np.float32),
    )
    print(f"pixel: {sum(v.size for v in state(policy).values())} params, {PARITY_STEPS} parity states")


def main() -> None:
    repo, out = Path(sys.argv[1]), Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    board(repo, out)
    pixel(repo, out)


if __name__ == "__main__":
    main()
