---
title: Subgradient descent with momentum
blurb: Stochastic subgradient descent, with and without heavy-ball momentum, as PyTorch optimizers on LASSO and a ReLU network, checked against scikit-learn.
repo: https://github.com/happyc0der/AOMML
year: 2024
order: 24
featured: false
stack: [Python, PyTorch, NumPy, scikit-learn, Matplotlib, pytest, uv, GitHub Actions]
tags: [ml, quant]
stats: ["89 tests", "sklearn gap 7.4e-5", "92.7% MNIST test"]
bullets:
  - "Stochastic subgradient descent and heavy-ball momentum as torch.optim.Optimizer subclasses, with constant, 1/sqrt(k) and 1/k step schedules, optional Nesterov, and both the buffer and Polyak difference forms, applied to LASSO and a ReLU network on MNIST."
  - "Correctness anchored to external references and 89 tests in CI: autograd agrees with the closed-form subgradient to 4e-16, the LASSO optimum is within 7.4e-5 of scikit-learn's coordinate descent, and each update rule matches torch.optim.SGD to 1e-14."
  - "Showed that momentum's apparent 9.3e8x speedup on an ill-conditioned problem falls to 1.05x once the effective step is matched, and that its real benefit is stability: plain SSGD diverges above an effective step of 1.5 while beta 0.99 stays stable to 300."
resume_bullets:
  - "Stochastic subgradient descent and heavy-ball momentum as torch.optim.Optimizer subclasses with constant, 1/sqrt(k) and 1/k schedules, on LASSO and a ReLU network."
  - "89 tests in CI: autograd matches the closed-form subgradient to 4e-16, LASSO optimum within 7.4e-5 of scikit-learn, updates match torch.optim.SGD to 1e-14."
  - "Momentum's apparent 9.3e8x speedup falls to 1.05x once the effective step is matched; its real benefit is stability at large steps."
---

A course project for Advanced Optimization Methods for Machine Learning at IIIT Delhi. Stochastic subgradient descent (SSGD) and SSGD with heavy-ball momentum are written as `torch.optim.Optimizer` subclasses and applied to two problems that are not smooth: LASSO, whose l1 penalty is not differentiable at zero, and a multi-layer ReLU network. Each runs first on synthetic data with a known ground truth, then on real data, California housing for LASSO and MNIST for the network.

The repository began in April 2024 as a seven-cell notebook that stated an intent and stopped: no optimizer, no objective, no training loop, and two of its nine defects were fatal, a hardcoded `.cuda()` call and a Boston housing URL that now returns HTTP 403. In September 2026 I rebuilt it as a package. The optimizers support constant, 1/sqrt(k) and 1/k step schedules, optional Nesterov, and both the buffer and Polyak difference forms of momentum. The training loop tracks the raw, running-best and Polyak-averaged iterates separately, because the subgradient method is not a descent method. MNIST and California housing are committed, so nothing needs the network. 89 tests run in CI alongside lint, format checks and a full execution of the notebook, and the nine original defects are covered by regression tests.

Correctness is checked against code I did not write. Autograd agrees with the closed-form subgradient to 4e-16, and at w = 0 every coordinate is a valid element of [-lambda, lambda]. The LASSO optimum is within 7.4e-5 of scikit-learn's coordinate descent with coefficients within 1.5e-3, and the true support is recovered at 10 of 10 tested lambdas. Each update rule is matched step by step and against `torch.optim.SGD` to 1e-14. On MNIST a 784-128-10 network trained for 5 epochs reaches 91.4% test accuracy with SSGD and 92.7% with momentum, selected on a held-out validation split.

Three results. The objective rose on 44% of recorded iterations while the method converged normally, so plotting only the raw iterate makes a correct implementation look broken. A constant step reaches a neighbourhood of the optimum and stops: quadrupling the budget left its gap at 5.4616, while 1/sqrt(k) kept descending. And momentum's benefit is stability rather than a better step. Comparing beta at a fixed alpha_0 suggests a 9.3e8x speedup, but that silently varies the effective step alpha_0/(1-beta); with the effective step matched, the advantage is 1.05x. What momentum buys is headroom: plain SSGD diverges above an effective step of 1.5 and beta 0.99 stays stable to 300. One limitation: plain subgradient descent does not land on exact zeros (0 of 50 coefficients, against up to 45 for scikit-learn), so support recovery needs thresholding, and a proximal method such as ISTA would be the natural next step.
