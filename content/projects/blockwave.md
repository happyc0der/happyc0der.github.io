---
title: Blockwave
blurb: A falling-block game with no asset files, and an RL agent that never sees the score.
repo: https://github.com/happyc0der/blockwave
year: 2026
order: 7
featured: false
stack: [Python, numpy, PyTorch, PPO]
tags: [ml, swe]
stats: ["465 tests", "pixel-only agent", "pretrained weights"]
bullets:
  - "Tetris-style game in pure Python and numpy with no asset files; graphics and audio are generated in code."
  - "PPO agent trained on an empowerment reward, never shown score or lines; board-state and pixel-only versions."
  - "465 tests; results reported with seed variance after two identical 150M-step runs differed by 42%."
---

The agent is rewarded for keeping its options open, not for clearing lines. It still learns to clear lines: 0.16 per piece from board state after 150M steps, against 0.39 for a hand-written heuristic.

Two identical runs gave 0.065 and 0.099, so I took back some earlier claims in the README. Pretrained checkpoints are in the repo.
