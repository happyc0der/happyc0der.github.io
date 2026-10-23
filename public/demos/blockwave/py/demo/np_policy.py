"""NumPy re-implementation of the two policy networks in blockwave_rl/agents/nets.py.

This file is written for the portfolio demo; it is not part of the BLOCKWAVE repo.
The repo's networks are PyTorch modules, and torch does not run in the browser,
so the forward pass is re-implemented here layer for layer:

    BoardPolicy  conv 2->32 3x3 pad 1, ReLU, conv 32->64 3x3 stride 2 pad 1, ReLU,
                 flatten (C, H, W order), concat the piece queue,
                 linear -> 256, ReLU, actor linear -> 8 logits, critic linear -> 1
    PixelPolicy  frames / 255, conv 4->32 8x8 stride 4, ReLU, conv 32->64 4x4 stride 2,
                 ReLU, conv 64->64 3x3, ReLU, flatten, linear -> 512, ReLU,
                 actor -> 8 logits, critic -> 1

The weights are the repo's pretrained checkpoints, exported once with torch to .npz
(build/export_weights.py). `parity()` checks this code against logits torch itself
produced for the same observations during that export.

Actions are *sampled* from the softmax, never argmax, because that is how the
repo's checkpoint_actor and watch tools act ("Argmax is a different policy").
The sampler is a seeded NumPy generator, so the sequence of games differs from a
torch run with the same seed even though the policy is the same.
"""

from __future__ import annotations

import io

import numpy as np
from numpy.lib.stride_tricks import sliding_window_view


def conv2d(x: np.ndarray, w: np.ndarray, b: np.ndarray, stride: int = 1, padding: int = 0) -> np.ndarray:
    """torch.nn.functional.conv2d for one (C, H, W) input, via im2col."""
    out_c, in_c, kh, kw = w.shape
    if padding:
        x = np.pad(x, ((0, 0), (padding, padding), (padding, padding)))
    win = sliding_window_view(x, (kh, kw), axis=(1, 2))[:, ::stride, ::stride]  # (C, OH, OW, kh, kw)
    oh, ow = win.shape[1], win.shape[2]
    cols = win.transpose(1, 2, 0, 3, 4).reshape(oh * ow, in_c * kh * kw)
    y = cols @ w.reshape(out_c, -1).T + b  # (OH*OW, O)
    return y.T.reshape(out_c, oh, ow)


def relu(x: np.ndarray) -> np.ndarray:
    return np.maximum(x, 0.0, out=x)


def _load(blob: bytes) -> dict[str, np.ndarray]:
    with np.load(io.BytesIO(blob)) as z:
        return {k: z[k].astype(np.float32) for k in z.files}


class NumpyBoardPolicy:
    def __init__(self, blob: bytes) -> None:
        p = _load(blob)
        self.c1 = (p["conv.0.weight"], p["conv.0.bias"])
        self.c2 = (p["conv.2.weight"], p["conv.2.bias"])
        self.fc = (p["trunk.0.weight"].T.copy(), p["trunk.0.bias"])
        self.actor = (p["actor.weight"].T.copy(), p["actor.bias"])
        self.critic = (p["critic.weight"].T.copy(), p["critic.bias"])
        self.n_params = sum(v.size for v in p.values())

    def forward(self, grid: np.ndarray, queue: np.ndarray) -> tuple[np.ndarray, float]:
        h = relu(conv2d(grid.astype(np.float32), *self.c1, stride=1, padding=1))
        h = relu(conv2d(h, *self.c2, stride=2, padding=1))
        h = np.concatenate([h.reshape(-1), queue.astype(np.float32)])
        h = relu(h @ self.fc[0] + self.fc[1])
        return h @ self.actor[0] + self.actor[1], float((h @ self.critic[0] + self.critic[1])[0])


class NumpyPixelPolicy:
    def __init__(self, blob: bytes) -> None:
        p = _load(blob)
        self.c1 = (p["conv.0.weight"], p["conv.0.bias"])
        self.c2 = (p["conv.2.weight"], p["conv.2.bias"])
        self.c3 = (p["conv.4.weight"], p["conv.4.bias"])
        self.fc = (p["trunk.1.weight"].T.copy(), p["trunk.1.bias"])
        self.actor = (p["actor.weight"].T.copy(), p["actor.bias"])
        self.critic = (p["critic.weight"].T.copy(), p["critic.bias"])
        self.n_params = sum(v.size for v in p.values())

    def forward(self, frames: np.ndarray) -> tuple[np.ndarray, float]:
        x = frames.astype(np.float32) / 255.0
        h = relu(conv2d(x, *self.c1, stride=4))
        h = relu(conv2d(h, *self.c2, stride=2))
        h = relu(conv2d(h, *self.c3, stride=1))
        h = relu(h.reshape(-1) @ self.fc[0] + self.fc[1])
        return h @ self.actor[0] + self.actor[1], float((h @ self.critic[0] + self.critic[1])[0])


def softmax(logits: np.ndarray) -> np.ndarray:
    z = logits.astype(np.float64) - logits.max()
    e = np.exp(z)
    return e / e.sum()


def sample(logits: np.ndarray, rng: np.random.Generator) -> int:
    return int(rng.choice(len(logits), p=softmax(logits)))


def parity(policy, blob: bytes, kind: str) -> tuple[float, int]:
    """Max |logit difference| against torch's own outputs saved at export time."""
    with np.load(io.BytesIO(blob)) as z:
        logits = z["logits"]
        if kind == "board":
            grids, queues = z["grid"], z["queue"]
            got = np.stack([policy.forward(grids[i], queues[i])[0] for i in range(len(logits))])
        else:
            frames = z["frames"]
            stack = frames.shape[0] - len(logits) + 1
            got = np.stack([policy.forward(frames[i : i + stack])[0] for i in range(len(logits))])
    return float(np.abs(got - logits).max()), len(logits)
