---
title: Blockwave
blurb: A falling-block game with no asset files, and an RL agent that learns to play without ever seeing the score.
repo: https://github.com/happyc0der/blockwave
image: /img/blockwave.png
year: 2026
order: 12
featured: false
stack: [Python, numpy, pygame-ce, PyTorch, PPO, pytest, ruff, uv]
tags: [ml, swe]
stats: ["465 tests", "~300k engine steps/s", "88x88 pixel agent"]
bullets:
  - "Guideline-style falling-block game in Python and numpy with no image, font or audio file in the repo: SRS rotation with both kick tables, 7-bag, T-spins, a 240 Hz fixed-timestep loop, deterministic replays and a headless engine at about 300k steps per second."
  - "PPO agent trained on an empowerment reward that never sees score, lines or level, enforced by a static firewall test; the pixel version sees only an 88x88 crop and learns what its keys do from 60,000 blind key-press trials before counting futures through that model."
  - "465 tests in about 40 seconds; after two identical 150M-step runs differed by 42%, I withdrew every single-seed comparison from the README and research log and added a compare tool that refuses to print a significance figure for one seed."
resume_bullets:
  - "Wrote a falling-block game in Python and numpy with no asset files: SRS rotation, 7-bag, T-spins, a 240 Hz fixed timestep, 300k engine steps per second headless."
  - "Trained a PPO agent on an empowerment reward that never sees score, lines or level (enforced by a static test); the pixel version learns from an 88x88 crop."
  - "465 tests run in 40 s; after two identical 150M-step runs differed by 42%, withdrew every single-seed comparison from the write-up."
---

The game is written in Python and rendered in numpy. There is no image, font or audio file in the repository: each frame is painted into arrays, the typeface is a procedural bitmap atlas, and the 20 sound effects and 5 music loops are synthesized from oscillators by `blockwave gen-assets`. The rules are the modern guideline set, with SRS rotation and separate kick tables for the I piece and the rest, 7-bag piece selection, hold, a five-piece preview, extended placement lock delay capped at 15 resets, and the three-corner T-spin rule. The engine imports no pygame and takes its timestep as an argument, so the game loop, a replay and a headless script drive it identically, and it runs at about 300k steps per second, which is what makes the 10,000-action fuzz test cheap.

The second package is an agent that is never told the score. Score, lines and level reach only the evaluator, and a static test fails if any other module reads them. The reward is empowerment: how many distinct futures the agent's key presses can still reach. The board-state version counts those futures with the simulator and reaches 0.163 lines per piece after 150M steps, against 0.393 for a scripted heuristic and 0.0018 for a policy that simply never hard-drops. The pixel version sees only an 88x88 crop of the screen at five decisions per second, so it cannot borrow the simulator: it runs 60,000 trials of blind key-press programs, fits a model of what they do, and counts futures through that model. The shipped 50M-step pixel agent clears 0.094 lines per piece and survives about 50 pieces a game, and both packages come with pretrained checkpoints.

A second seed of the 150M pixel configuration scored 0.0647 where the first scored 0.0991, a spread of 42% of their mean and about 19 times the within-run standard error I had been quoting. That made every single-seed comparison between reward variants and compute budgets uninterpretable, so I withdrew them in place in the research log rather than deleting them, and wrote `blockwave_rl.compare`, which groups runs by configuration and refuses to print a significance figure for a single seed. Resolving the effect I had reported would take about 214 seeds per arm at five hours each, so the question is closed as unanswerable at that cost. What survives is the deliverable: both seeds beat the drift baseline by 36x and 55x.

The 465 tests run in about 40 seconds. They check kick-table transcription in both directions, audit board invariants after 10,000 random actions, check audio for clipping, DC offset and clicks at loop seams, render each visual setting on and off and fail if the frame does not change, and assert that two boards differing only in score give byte-identical observations to the agent. Policies that beat the reward are recorded as strict expected failures rather than hidden.
