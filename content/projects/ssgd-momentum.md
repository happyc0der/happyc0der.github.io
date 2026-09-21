---
title: Subgradient descent with momentum
blurb: Stochastic subgradient methods as PyTorch optimizers, on LASSO and an MLP.
repo: https://github.com/happyc0der/AOMML
year: 2024
order: 15
featured: false
stack: [Python, PyTorch]
tags: [quant, ml]
stats: ["89 tests", "matches sklearn to 7.4e-5"]
bullets:
  - "Stochastic subgradient descent with and without momentum, written as PyTorch optimizers, on LASSO and an MLP."
  - "Matches scikit-learn's LASSO optimum to 7.4e-5; momentum's apparent speedup drops to 1.05x once step size is matched. 89 tests."
---

Momentum looked enormously faster until I matched the effective step size. Then it was 1.05x. What it really buys is stability at large steps.

Optimization for ML coursework at IIIT Delhi, rebuilt this year from a notebook that no longer ran.
