---
title: Biohub cell tracking
blurb: Kaggle cell-tracking competition entry on free GPU, public leaderboard 0.952 from an offline post-processing harness and a 3D CNN that prunes false cell divisions, final ranking pending.
year: 2026
order: 9
featured: false
status: in progress
credit: "The submission is a fork of Igor Zharov's public Harmonic Fusion notebook (Apache-2.0). The offline harness, the division classifiers and every experiment are mine."
resume_credit: "Builds on Igor Zharov's public notebook (Apache-2.0); the harness, classifiers and experiments are mine."
stack: [Python, PyTorch, NumPy, SciPy, polars, scikit-learn, uv, Kaggle API]
tags: [ml, data]
stats: ["public LB 0.952", "+0.005 measured twice", "~22 Kaggle GPU-hours"]
bullets:
  - "Kaggle Biohub Cell Tracking During Development (September 2026): public leaderboard 0.952 against 0.947 for the unmodified public notebook it builds on, using only free Kaggle GPU; final ranking pending."
  - "Built an offline harness that runs GPU inference on Kaggle once, then re-runs the notebook's post-processor locally against the hosts' official scorer on 40 held-out videos, five times the upstream validator, and matches the notebook's own score to +0.00011."
  - "Trained a small 3D CNN on 134 annotated cell divisions to prune false division forks: predicted +0.0047 on a pre-registered holdout, measured +0.005 on the leaderboard twice, while nine other ideas were tried and rejected."
resume_bullets:
  - "Scored 0.952 on the Kaggle Biohub Cell Tracking public leaderboard on free Kaggle GPU, against 0.947 for the public notebook it builds on; final ranking pending."
  - "Built an offline harness that runs GPU inference once, then re-tunes post-processing locally against the official scorer on 40 held-out videos; it reproduces the notebook's score to within 0.00011."
  - "Trained a 3D CNN on 134 annotated cell divisions to prune false branches: predicted +0.0047 on a pre-registered holdout, measured +0.005 on the leaderboard twice."
---

This is a code competition with a 12-hour notebook cap, and I had only the free Kaggle GPU quota. The strongest public notebook, Harmonic Fusion, scores 0.947 and tunes its post-processing inside the notebook on 8 videos with 7 candidate configurations, because inference eats the budget. Inference needs the GPU; post-processing does not. I forked the notebook, ran inference once over 40 held-out training videos, exported the raw prediction graphs and ground truth, and pulled the post-processor out of the notebook with an AST extractor so it runs on my laptop against the hosts' official scorer. Before trusting anything downstream I checked the port against the notebook's own output: score delta +0.00011, median node shift 0.0000 µm against a 7 µm matching tolerance.

Every offline number is a selection set of 26 videos against a holdout of 14, balanced by embryo and split before any experiment. Most ideas died there. A 358-evaluation coordinate descent over 20 post-processing knobs gained +0.016 on the selection set and lost 0.010 on the holdout. Turning off the DeepCenter veto, loosening the division gates, and rewiring daughters to a different parent on geometric rules all failed too: in 29 of 60 annotated divisions the true parent sits about five times farther from its daughter than a competing node, so no local rule recovers them. One flag that gained +0.0045 on the holdout lost 0.002 on the leaderboard; a holdout with 17 division events cannot separate +0.004 from zero, and the log says so.

The one change that survived is a small 3D CNN, trained on 134 real cell divisions, that scores every node and prunes division forks it judges false. On the holdout it cut division false positives from 6 to 3 without losing a true positive, gave the identical result at every threshold from 0.10 to 0.30, and cleared a random-score floor I had measured first. It predicted +0.0047; the leaderboard gave +0.005 twice, 0.945 to 0.950 and 0.947 to 0.952. The shipped version averages two such classifiers. The whole result cost about 22 of a 30-hour weekly GPU quota, each run logged with its cost.

The competition closes on 2026-09-29 and the final ranking is pending, so this page carries only the public score. The code is private for now, under GPL-3.0, with the full experiment log, the GPU ledger and a step-by-step reproduction in the repository.
