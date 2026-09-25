---
title: Kaggle S6E9, EV purchases
blurb: Kaggle Playground S6E9, public leaderboard 0.94649 against a leader at 0.94674, with a 192-experiment ledger and a label-noise ceiling analysis, final ranking pending.
repo: https://github.com/happyc0der/kaggle-s6e9-ev-purchases
year: 2026
order: 11
featured: false
stack: [Python, LightGBM, XGBoost, CatBoost, PyTorch, scikit-learn, SciPy, Kaggle API]
tags: [ml, data]
stats: ["public LB 0.94649", "192 experiments", "669k rows"]
bullets:
  - "Kaggle Playground S6E9 (EV purchases, ROC AUC): out-of-fold AUC 0.94648, public leaderboard 0.94649 (hedge entry) and 0.94642 (best validated entry) against a leader at 0.94674, final ranking pending."
  - "Nested target encodings over the synthetic generator's artifacts on 668,665 rows, 20 folds with encoding-seed bags, and a logit blend of LightGBM, CatBoost and a 15-seed MLP with hard-edge post-processing."
  - "Logged 192 experiments judged by paired DeLong tests (accept at +0.00008 with z ≥ 3, noise floor about 0.00003), and showed by label resampling that a perfect model would score 0.9459 ± 0.0003, so the remaining gap is label noise."
resume_bullets:
  - "Kaggle Playground S6E9 (ROC AUC): out-of-fold 0.94648, public leaderboard 0.94649 against a leader at 0.94674; final ranking pending."
  - "Feature engineering with nested target encodings over the synthetic generator's artifacts on 668,665 rows, 20-fold cross-validation; logit blend of LightGBM, CatBoost and a 15-seed MLP."
  - "192 experiments judged by paired DeLong hypothesis tests; label resampling showed a perfect model scores 0.9459 ± 0.0003, so the gap left is label noise."
---

Kaggle Playground Series S6E9 asks for the probability that a person buys an electric vehicle, scored by ROC AUC. The train set (668,665 rows) and test set (286,571 rows) are synthetic, generated from a 10,000-row original that is itself synthetic: features drawn from a fixed random state, label from a probit formula on income, environmental concern, subsidy and range anxiety. Nearly every point of AUC above about 0.942 comes from the generator's artifacts. A few thousand income and commute values are heavily over-produced, and the label rate at those values departs from the formula. So I modelled how the data was made rather than what it represents.

LightGBM on the 13 raw columns scores 0.9419 out of fold. Per-value frequency, lift against the original and novelty features take it to 0.9436, nested target encodings of income and commute at several bin widths to 0.9459, shallow column-subsampled trees with target encodings on every column to 0.9462, and 20 folds with encoding-seed bags and a logit blend of LightGBM, CatBoost and a 15-seed MLP to 0.9464. XGBoost was trained alongside and got zero weight. The last 0.0001 came from hill-climbing blend weights over out-of-fold prediction libraries other competitors had published; they are credited in the repo and not redistributed. The public leaderboard tracked my out-of-fold score within about 0.0001 throughout.

Every idea ran against a fixed reference with a paired DeLong test and went into experiments/results.csv, 192 rows, most of them negative: interaction encodings in every form, similarity to original rows, density windows, digit residues, pseudo-labelling, native categorical handling, deeper or tuned trees, neural-net value embeddings, segment-wise calibration and more, all within ±0.00005 or worse. The accept rule was a paired gain of at least +0.00008 with z ≥ 3, against a noise floor near 0.00003. To see what was left, I resampled labels from the model's own calibrated probabilities: a perfect model scores 0.9459 ± 0.0003 on those, per cell of concern, subsidy and anxiety the real score matches that ceiling within 0.001, and a model trained to predict the blend's errors explains none of them (R² = −0.003). The rest is label noise the generator put there.

The competition closes on 2026-09-30, so the final ranking is pending. The pipeline is public under GPL-3.0 with a rerun playbook, dataset-fact tests, a leak-freeness test for the encodings and a synthetic end-to-end smoke test.
