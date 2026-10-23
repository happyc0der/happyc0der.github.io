"""The demo's glue between the page and BLOCKWAVE's own code. Written for the demo.

Everything that decides what happens in a game is the repo's code, imported
unchanged: the engine and its rules (blockwave.core), the renderer
(blockwave.render.compositor), the agent's environments (blockwave_rl.env.base,
blockwave_rl.reward.empowerment_env, with the live empowerment reward) and the
keyboard DAS/ARR handler (blockwave.app.input). What lives here is only:

* the policy forward pass, which is the NumPy re-implementation in np_policy.py;
* the loops that the repo's watch tools run in a window, re-expressed as one
  call per decision or per animation frame, so the browser can drive them;
* packing frames into RGBA for a <canvas>.

The structure follows blockwave_rl/watch.py (board agent) and
blockwave_rl/world/watch_pixel.py (pixel agent).
"""

from __future__ import annotations

import json
import sys
import time
import types
from collections import deque

import numpy as np


def _stub_pygame() -> None:
    """blockwave.app.input reads pygame's K_* constants for its default key binds.

    pygame does not run here: the page delivers key events itself. A stand-in
    module with distinct integers for the names input.py uses lets the repo's
    InputState run unchanged. The page sends key names, never pygame codes.
    """
    if "pygame" in sys.modules:
        return
    names = (
        "K_LEFT K_RIGHT K_DOWN K_UP K_SPACE K_x K_z K_c K_p K_q K_LCTRL K_RCTRL "
        "K_LSHIFT K_RSHIFT K_ESCAPE K_RETURN K_KP_ENTER"
    ).split()
    stub = types.ModuleType("pygame")
    stub.__doc__ = "Key-constant stand-in for the browser demo; not pygame."
    for i, name in enumerate(names, start=1):
        setattr(stub, name, i)
    sys.modules["pygame"] = stub


_stub_pygame()

from blockwave.app.input import InputState  # noqa: E402
from blockwave.app.replay import apply_tick  # noqa: E402
from blockwave.core.constants import Action  # noqa: E402
from blockwave.core.engine import Engine, EngineConfig  # noqa: E402
from blockwave.core.events import EventType  # noqa: E402
from blockwave.render.compositor import Compositor  # noqa: E402
from blockwave.render.layout import HUMAN_CELL_PX, Layout  # noqa: E402
from blockwave_rl.env.base import BlockwaveEnv, EnvConfig, ObsMode  # noqa: E402
from blockwave_rl.env.crops import Variant  # noqa: E402
from blockwave_rl.evaluate import EVAL_SEED  # noqa: E402
from blockwave_rl.reward.empowerment_env import EmpowermentEnv  # noqa: E402

from demo.np_policy import NumpyBoardPolicy, NumpyPixelPolicy, parity, sample, softmax  # noqa: E402

#: The value of blockwave.app.main.LOGIC_HZ. main.py itself needs pygame for real.
LOGIC_HZ = 240
LOGIC_DT = 1.0 / LOGIC_HZ
#: The cap the game loop puts on one frame's worth of catch-up (app.main.MAX_FRAME_TIME is 0.25 s).
MAX_FRAME_TIME = 0.25

ACTION_NAMES = [a.name for a in Action]


class Canvas:
    """An RGBA buffer the page reads straight out of WASM memory."""

    def __init__(self, height: int, width: int) -> None:
        self.rgba = np.full((height, width, 4), 255, dtype=np.uint8)

    def put(self, rgb: np.ndarray) -> None:
        if rgb.ndim == 2:
            self.rgba[..., :3] = rgb[..., None]
        else:
            self.rgba[..., :3] = rgb


class _Counted:
    """Per-game pieces and lines as positive increments, the way evaluate.GameTracker
    counts them: a top-out soft-resets the engine and zeroes its stats."""

    def __init__(self) -> None:
        self.pieces = self.lines = 0
        self.games: list[dict] = []
        self._prev_pieces = self._prev_lines = 0

    def update(self, info: dict) -> None:
        self.pieces += max(0, info["pieces"] - self._prev_pieces)
        self.lines += max(0, info["lines"] - self._prev_lines)
        self._prev_pieces, self._prev_lines = info["pieces"], info["lines"]
        if info["top_out"]:
            self.games.append({"pieces": self.pieces, "lines": self.lines})
            self.pieces = self.lines = 0
            # The soft reset already happened inside step(): its stats are the new game's.
            self._prev_pieces, self._prev_lines = info["pieces"], info["lines"]


class BoardWatch:
    """The 150M-step board-state agent playing, as blockwave_rl/watch.py runs it."""

    def __init__(self, weights: bytes, config_json: str, profile: str = "arcade", cell_px: int = HUMAN_CELL_PX) -> None:
        self.config = json.loads(config_json)
        self.policy = NumpyBoardPolicy(weights)
        self.cell_px = cell_px
        self.set_profile(profile)
        self.new_session(EVAL_SEED)

    def set_profile(self, profile: str) -> None:
        self.profile = profile
        self.compositor = Compositor(Layout(self.cell_px), profile)
        h, w = self.compositor.frame_size
        self.canvas = Canvas(h, w)

    def new_session(self, seed: int) -> None:
        c = self.config
        self.env = EmpowermentEnv(horizon=c["horizon"], agent_hz=c.get("agent_hz", 20.0), gravity_scale=c.get("gravity", 4.0))
        self.grid, self.queue = self.env.reset(seed=seed)
        self.rng = np.random.default_rng(seed)
        self.counted = _Counted()
        self.decisions = 0
        self.seed = seed

    def step(self) -> str:
        t0 = time.perf_counter()
        logits, value = self.policy.forward(self.grid, self.queue)
        action = sample(logits, self.rng)
        t1 = time.perf_counter()
        step = self.env.step(action)
        t2 = time.perf_counter()
        self.grid, self.queue = step.grid, step.queue
        self.decisions += 1
        self.counted.update(step.info)
        return json.dumps({
            "action": action,
            "probs": [round(float(p), 4) for p in softmax(logits)],
            "value": round(value, 4),
            "locked": step.locked,
            "reward": round(step.reward, 5) if step.locked else None,
            "top_out": step.top_out,
            "pieces": self.counted.pieces,
            "lines": self.counted.lines,
            "games": self.counted.games[-12:],
            "n_games": len(self.counted.games),
            "decisions": self.decisions,
            "policy_ms": round((t1 - t0) * 1000, 2),
            "env_ms": round((t2 - t1) * 1000, 2),
        })

    def render(self) -> float:
        t0 = time.perf_counter()
        self.canvas.put(self.compositor.render(self.env.env.engine))
        return (time.perf_counter() - t0) * 1000

    def parity(self, blob: bytes) -> str:
        err, n = parity(self.policy, blob, "board")
        return json.dumps({"max_abs": err, "n": n, "params": int(self.policy.n_params)})


class PixelWatch:
    """The 50M-step pixel agent, as blockwave_rl/world/watch_pixel.open_session builds it."""

    def __init__(self, weights: bytes, config_json: str, cell_px: int = HUMAN_CELL_PX, profile: str = "arcade") -> None:
        c = json.loads(config_json)
        self.hz = float(c.get("agent_hz", 5.0))
        self.stack_size = int(c.get("frame_stack", 4))
        self.gravity = float(c.get("gravity", 4.0))
        self.policy = NumpyPixelPolicy(weights)
        self.cell_px = cell_px
        self.set_profile(profile)
        self.new_session(EVAL_SEED)

    def set_profile(self, profile: str) -> None:
        self.profile = profile
        self.compositor = Compositor(Layout(self.cell_px), profile)
        h, w = self.compositor.frame_size
        self.canvas = Canvas(h, w)

    def new_session(self, seed: int) -> None:
        self.env = BlockwaveEnv(
            EnvConfig(
                obs_mode=ObsMode.PIXELS, variant=Variant.BOARD_PLUS_PREVIEW, cell_px=4,
                agent_hz=self.hz, gravity_scale=self.gravity, frame_stack=1,
            )
        )
        self.env.reset(seed=seed)
        seen = self.env._pixels()
        self.stack = deque([seen] * self.stack_size, maxlen=self.stack_size)
        h, w = seen.shape
        self.crop = Canvas(h, w)
        self.crop.put(seen)
        self.rng = np.random.default_rng(seed)
        self.counted = _Counted()
        self.decisions = 0

    def step(self) -> str:
        t0 = time.perf_counter()
        logits, value = self.policy.forward(np.stack(tuple(self.stack)))
        action = sample(logits, self.rng)
        t1 = time.perf_counter()
        obs, _, _, _, info = self.env.step(action)
        t2 = time.perf_counter()
        # obs is the env's own render-crop-grey of the new state (frame_stack=1),
        # the same array watch_pixel gets by calling env._pixels() again.
        current = obs[-1]
        self.stack.append(current)
        self.crop.put(current)
        self.decisions += 1
        self.counted.update(info)
        return json.dumps({
            "action": action,
            "probs": [round(float(p), 4) for p in softmax(logits)],
            "value": round(value, 4),
            "top_out": bool(info["top_out"]),
            "pieces": self.counted.pieces,
            "lines": self.counted.lines,
            "games": self.counted.games[-12:],
            "n_games": len(self.counted.games),
            "decisions": self.decisions,
            "policy_ms": round((t1 - t0) * 1000, 2),
            "env_ms": round((t2 - t1) * 1000, 2),
        })

    def render(self) -> float:
        t0 = time.perf_counter()
        self.canvas.put(self.compositor.render(self.env.engine))
        return (time.perf_counter() - t0) * 1000

    def parity(self, blob: bytes) -> str:
        err, n = parity(self.policy, blob, "pixel")
        return json.dumps({"max_abs": err, "n": n, "params": int(self.policy.n_params)})


class _Held:
    """What InputState.poll expects from pygame.key.get_pressed(): keys[code] -> bool."""

    def __init__(self) -> None:
        self.codes: set[int] = set()

    def __getitem__(self, code: int) -> bool:
        return code in self.codes


class Play:
    """The visitor plays: the repo's Engine, InputState and Compositor at the
    game's own 240 Hz fixed timestep. Sound, screen shake, particles and the
    title/pause scenes belong to app/main.py, which needs pygame, and are left out."""

    def __init__(self, profile: str = "arcade", cell_px: int = HUMAN_CELL_PX) -> None:
        self.cell_px = cell_px
        self.engine = Engine(EngineConfig(seed=int(np.random.default_rng().integers(0, 2**31 - 1))))
        self.input = InputState()
        self.held = _Held()
        self.accumulator = 0.0
        self.set_profile(profile)

    def set_profile(self, profile: str) -> None:
        self.profile = profile
        self.compositor = Compositor(Layout(self.cell_px), profile)
        h, w = self.compositor.frame_size
        self.canvas = Canvas(h, w)

    def restart(self) -> None:
        self.engine.reset(seed=int(np.random.default_rng().integers(0, 2**31 - 1)))
        self.input = InputState()
        self.held.codes.clear()
        self.accumulator = 0.0

    def _code(self, name: str) -> int:
        return getattr(sys.modules["pygame"], name)

    def key_down(self, name: str) -> None:
        code = self._code(name)
        self.held.codes.add(code)
        self.input.key_down(code)

    def key_up(self, name: str) -> None:
        code = self._code(name)
        self.held.codes.discard(code)
        self.input.key_up(code)

    def release_all(self) -> None:
        for code in list(self.held.codes):
            self.input.key_up(code)
        self.held.codes.clear()

    def advance(self, frame_s: float) -> str:
        """One animation frame: as many fixed 240 Hz ticks as the elapsed time holds."""
        t0 = time.perf_counter()
        self.accumulator += min(frame_s, MAX_FRAME_TIME)
        ticks = 0
        while self.accumulator >= LOGIC_DT and not self.engine.game_over:
            actions = self.input.poll(LOGIC_DT, self.held)
            for event in apply_tick(self.engine, actions, LOGIC_DT):
                if event.type is EventType.PIECE_LOCK:
                    self.input.on_piece_locked()
            self.accumulator -= LOGIC_DT
            ticks += 1
        t1 = time.perf_counter()
        self.canvas.put(self.compositor.render(self.engine))
        t2 = time.perf_counter()
        s = self.engine.stats
        return json.dumps({
            "ticks": ticks, "game_over": self.engine.game_over,
            "score": s.score, "lines": s.lines, "level": s.level, "pieces": s.pieces_placed,
            "logic_ms": round((t1 - t0) * 1000, 2), "render_ms": round((t2 - t1) * 1000, 2),
        })


def bench(profile: str, cell_px: int, n: int = 8) -> float:
    """Median milliseconds for one Compositor.render of a fresh engine in this browser."""
    engine = Engine(EngineConfig(seed=EVAL_SEED))
    comp = Compositor(Layout(cell_px), profile)
    comp.render(engine)
    times = []
    for _ in range(n):
        t0 = time.perf_counter()
        comp.render(engine)
        times.append((time.perf_counter() - t0) * 1000)
    return float(np.median(times))
