---
title: Kaggle S6E9, EV purchases
blurb: Tabular pipeline with 190+ logged experiments and a noise-ceiling analysis.
repo: https://github.com/happyc0der/kaggle-s6e9-ev-purchases
year: 2026
order: 8
featured: false
stack: [Python, LightGBM, XGBoost, CatBoost, PyTorch, Optuna, polars]
tags: [ml, data, quant]
stats: ["AUC 0.9465", "190+ experiments", "669k rows"]
bullets:
  - "Kaggle Playground S6E9 (EV purchases): out-of-fold AUC 0.9465, public leaderboard 0.94649 against a leader at 0.94674."
  - "Nested target encoding feeding LightGBM, XGBoost, CatBoost and an MLP; 669k training rows."
  - "190+ logged experiments compared with paired DeLong tests; showed the remaining gap is label noise."
---

The data is synthetic, generated from 10,000 real rows, and the generator leaves artifacts. Most of the score comes from encoding those without leaking the target.

Most of the 190 experiments were negative. I kept them all in a ledger, and tried to predict the model's own errors to see what was left (R² = -0.003, so nothing).
