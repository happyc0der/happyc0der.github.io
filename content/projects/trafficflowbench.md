---
title: TrafficFlowBench
blurb: Kaggle freeway traffic benchmark, public leaderboard 0.845 against a 0.5534 baseline, final ranking pending.
year: 2026
order: 10
featured: false
status: not yet public
stack: [Python, LightGBM, scikit-learn, NumPy, SciPy, polars, pandas, Kaggle API]
tags: [ml, data]
stats: ["public LB 0.845", "onset IoU 0.57 to 0.93", "2 h bit-for-bit repro"]
bullets:
  - "Kaggle TrafficFlowBench (2026 IEEE Big Data Cup): public leaderboard 0.84481 against the organizers' 0.5534 baseline, up from 0.67365 on my first submission, final ranking pending."
  - "Four-task pipeline: same-link time interpolation for missing detector cells, LightGBM queue forecasters trained out of core on 56M rows from 273 train days with causal features, and an exact-fit NNLS origin-destination solver."
  - "Found a window-selection regularity in the queue-onset task that lifted onset IoU from 0.57 to 0.93 and reported it on the competition forum; the hosts confirmed it and announced it to all teams."
resume_bullets:
  - "Kaggle TrafficFlowBench (IEEE Big Data Cup 2026): public leaderboard 0.845 vs the 0.553 baseline, up from 0.67365 on my first submission; final ranking pending."
  - "Same-link interpolation for missing cells, LightGBM queue forecasters trained out of core on 56M rows with causal features, exact-fit NNLS origin-destination solver."
  - "Found a window-selection regularity that lifted queue-onset IoU from 0.57 to 0.93; reported it on the forum, and the hosts announced it to all teams."
---

TrafficFlowBench is the 2026 IEEE Big Data Cup competition on Kaggle: ten freeway corridors at five-minute resolution and four scored tasks on the same data. Fill the missing detector cells, say which links are queued over the next thirty minutes, keep the reconstruction consistent with traffic-flow physics, and estimate an origin-destination matrix. The score weights them 0.35, 0.30, 0.15 and 0.20. The public leaderboard scores one month and a separately generated month decides the final ranking, so I validate on the 273 train days and use the leaderboard only as a transfer check.

My first submission, same-link time interpolation for the state plus the organizers' baselines for queues and OD demand, scored 0.67365. Most of the gain since then came from Task 2: LightGBM models per window type, trained out of core on 56M rows generated from every train day, with features restricted to timestamps at or before the forecast origin, and a unit test on the day-context features that overwriting later slots leaves them unchanged. For Task 4 I solve the OD matrix on each split's own link counts rather than the train counts the organizer script used, since the released counts are noise-free and an unregularised NNLS fits them exactly.

Checking the shipped queue-onset train windows, I found that in 39 of 40 the first queued cell appears exactly at T+30, a side effect of how the organizers pick window origins. A model trained only on windows built the same way lifted onset IoU from 0.57 to 0.93 on held-out dates. I wrote it up on the competition forum, said plainly that my submission already used it, and offered to switch back. The hosts confirmed the regularity, said it could be used, and announced it to every team.

reproduce.sh rebuilds the submitted file bit-for-bit from the raw data in about two hours on my Mac, since the rules require winners to reproduce their file from code. Probes of the Task 4 deviation form lost on the leaderboard, ramp-demand features and a 1-D CNN second opinion for ongoing queues lost in local validation, and all are logged as rejected in NOTES.md. The repository is local only for now.
