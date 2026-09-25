---
title: Biohub cell tracking
blurb: Kaggle competition. Public leaderboard 0.952, final ranking pending.
year: 2026
order: 5
featured: true
stack: [Python, PyTorch, 3D CNN, Kaggle API]
tags: [ml, data]
stats: ["public LB 0.952", "3D CNN pruner", "+0.005 measured"]
bullets:
  - "Kaggle Biohub Cell Tracking: public leaderboard 0.952. Final ranking pending."
  - "Offline harness that splits GPU inference from CPU post-processing, so tuning runs locally against the official scorer."
  - "3D-CNN cell-division classifier trained on 134 examples; holdout predicted +0.0047, the leaderboard gave +0.005."
---

Kaggle GPU time was the bottleneck, so I cached model outputs once and tuned everything downstream on my laptop. The local port matches the notebook to +0.00011.

The gain came from one idea, a small 3D CNN that prunes false cell divisions. Nine other ideas were tested on a holdout and rejected. Code is private while the competition runs.
