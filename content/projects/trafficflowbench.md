---
title: TrafficFlowBench
blurb: Solo Kaggle freeway traffic benchmark entry (team Dank Axon), public leaderboard 0.892 against a 0.553 baseline, final ranking pending.
repo: https://github.com/happyc0der/trafficflowbench
year: 2026
order: 10
featured: false
status: in progress
stack: [Python, PyTorch, LightGBM, scikit-learn, NumPy, SciPy, polars, pandas, Kaggle API]
tags: [ml, data]
stats: ["public LB 0.892", "onset IoU 0.57 to 0.93", "6.8 and 7.2 h local byte-for-byte repro"]
bullets:
  - "Kaggle TrafficFlowBench (2026 IEEE Big Data Cup), solo as team Dank Axon: public leaderboard 0.892 (0.89171 for the final pair, sub63 and sub64) against the organizers' 0.553 baseline, up from 0.674 on my first submission; final ranking pending."
  - "Four-task pipeline: state from a same-link interpolation plus neighbor ridge baseline corrected by four LightGBM residual models and four 2-D U-Nets of my own in PyTorch (two seeds and two further train re-masks, each fine-tuned on self-masks of both scored months, 0.8 of the blend); LightGBM queue forecasters on causal features, with onset sets chosen within ±12 links of the most likely cell; and a regularized non-negative least-squares origin-destination solve on each split's own link counts."
  - "Found a window-selection regularity in the queue-onset task that lifted onset IoU from 0.57 to 0.93 and reported it on the competition forum; the hosts confirmed it and announced it to all teams. Both final submissions rebuild byte for byte from a fresh clone of my local repository (6.8 h and 7.2 h), and the causality check passes 304 of 304 comparisons; that final code is not public yet."
resume_bullets:
  - "Scored 0.892 solo on the Kaggle TrafficFlowBench (IEEE Big Data Cup) public leaderboard against a 0.553 baseline; final ranking pending."
  - "Built LightGBM and PyTorch U-Net models, causal time-series forecasters and an NNLS origin-destination solver."
  - "Found a window-selection regularity that lifted queue-onset IoU from 0.57 to 0.93; reported it on the forum, and the hosts announced it to all teams."
---

TrafficFlowBench is the 2026 IEEE Big Data Cup competition on Kaggle: ten freeway corridors at five-minute resolution and four scored tasks on the same data. Fill the missing detector cells, say which links are queued over the next thirty minutes, keep the reconstruction consistent with traffic-flow physics, and estimate origin-destination (OD) path flows from link counts. The score weights them 0.35, 0.30, 0.15 and 0.20. The public leaderboard scores one month and a separately generated month decides the final ranking. I entered solo as team Dank Axon. Final submissions are due Nov 6, the competition ends Nov 7, 2026, and code and report are due Nov 10, so the final ranking is pending.

The public score is 0.892 (0.89171 for the final pair, sub63 and sub64), against the organizers' 0.553 baseline and 0.674 for my first submission, which used same-link time interpolation plus the organizers' baselines for queues and OD demand. State and physics now contribute 0.443 of their 0.50, queues score 0.834 and OD scores 0.994.

Most of the gain came from the queue task, and the main lesson was what not to trust. Inside the training split the queue models scored about 0.92 while the leaderboard gave 0.775. The nine train months are one simulated world: their congestion maps correlate 0.98 with each other and 0.85 with the scored months, so checks inside train overstated the queue score by about 0.14. On an organizer-emulating proxy, an all-feature ongoing model trained out of core on 48M rows scored below the same model on 8,000 windows (0.795 vs 0.828), and dropping the train-world frequency map lifted the proxy further (0.828 to 0.868). The ongoing model I kept has no map and trains on 8,000 uniform plus 8,000 selection-matched windows; the selection-matched half barely moved the proxy and added 0.0044 on the leaderboard. The real windows' horizons are blanked in the release, so the proxy can never contain one, and for new kinds of queue model only the leaderboard was a fair test.

Checking the shipped queue-onset train windows, I found that in 39 of 40 the first queued cell appears exactly at T+30, a side effect of how the organizers pick window origins. A model trained only on windows built the same way lifted onset IoU from 0.57 to 0.93 on held-out dates. I wrote it up on the competition forum, said plainly that my submission already used it, and offered to switch back. The hosts confirmed the regularity, said it could be used, and announced it to every team. The last queue gain came from set selection: a new queue forms at one bottleneck, so choosing onset sets within ±12 links of the most likely cell added 0.030 onset IoU out of fold and moved the leaderboard from 0.89113 (sub54 and sub55) to 0.89171.

The state task added 0.024. On top of a same-link interpolation plus neighbor ridge baseline it blends four LightGBM residual models (A to D) with four small 2-D U-Nets of my own in PyTorch (three levels, 0.85M parameters) that see a corridor's whole masked day: two seeds and two further train re-masks, each fine-tuned on self-masks of both scored months. The U-Nets take 0.8 of the weight and the trees 0.2, separately for speed and for density. Once fine-tuning started I judged each step on held-out self-masks of the scored month, where the leaderboard returned 52 to 71% of the U-Net estimates, against 25 to 77% for held-out train days.

For the OD task I solve on each split's own link counts rather than the train counts the organizer script used. The released counts are noise-free and an unregularized non-negative solve fits them to 0.9999; the final solve adds an L2 pull to the split's prior.

The rules require winners to reproduce their file from code within 1% of the private score. `reproduce.sh` rebuilds everything from the released data, and both final submissions came back byte for byte from a fresh clone of my local repository (6.8 h and 7.2 h on my Mac, all four U-Nets retrained). The hosts will also rerun the code with every row stamped after each window's origin removed; `causality_check.py` does that deletion at all 152 validation and private origins, and queue-task inputs stay identical in 304 of 304 comparisons. In a separate control, a planted two-hour leak was flagged on 8 of 8 sampled cuts. The two final files differ only in 131 private-month ongoing rows, a hedge on whether training on the public month helps private-month forecasts, which the public leaderboard cannot test. Rejected probes, including OD deviation forms and queue models without train-world inputs, are logged in NOTES.md.

The linked repo is still at its September 25 state (public score 0.845). The final code, including this `reproduce.sh` and `causality_check.py`, the report and the later NOTES.md entries are not public yet.
