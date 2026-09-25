---
title: Noisy-label tabular models
blurb: "Course assignment comparing a plain MLP, Noise Attention Learning, a partial SubTab autoencoder, TabPFN and an LSTM on synthetic tabular data at three label-noise levels."
repo: https://github.com/WillOfSprings/aml-a1
year: 2024
order: 30
listed: false
featured: false
team: 2
status: private
credit: "Two-person course assignment with Pratyush Kumar (WillOfSprings on GitHub), who owns the repo and made all 13 commits. Both milestone reports list us as co-authors. The NAL MLP and TabPFN notebooks carry my laptop's run metadata (the RTX 3080 Ti both reports name as the hardware); the SubTab and LSTM notebooks ran on a different machine with a GTX 1660 Ti."
stack: [Python, PyTorch, TabPFN, pandas, scikit-learn, Jupyter]
tags: [ml]
stats: ["NAL 63.79% to 74.19%", "TabPFN 85.31% test", "3 noise levels"]
bullets:
  - "Compared five approaches on a 24-feature synthetic tabular dataset at zero, low and high label noise for two targets: a baseline MLP, the same MLP with a Noise Attention Learning loss, a partial SubTab autoencoder, TabPFN and an LSTM."
  - "Noise Attention Learning raised test accuracy on the era target from 63.79% to 74.19% on low-noise data and from 44.90% to 49.75% on high-noise data, and cost accuracy on clean data (76.41% to 42.05%)."
  - "Fitted TabPFN within its 1,000-row and 10-class limits by fitting on a 1,000-row sample and chaining two classifiers, the first trained on classes 0 to 9 and handing any row it labels 9 to a second trained on classes 9 to 11, reaching 85.31% test accuracy on the 12-class era target with zero noise."
resume_bullets:
  - "Compared MLP, Noise Attention Learning, a partial SubTab autoencoder, TabPFN and an LSTM on 24-feature synthetic tabular data at three label-noise levels."
  - "Noise Attention Learning loss raised era test accuracy from 63.79% to 74.19% at low noise and 44.90% to 49.75% at high noise."
  - "Worked around TabPFN's 1,000-row and 10-class limits with a 1,000-row fit and two chained classifiers; 85.31% test accuracy, 12 classes, zero noise."
---

Assignment 1 of Advanced Machine Learning at IIIT Delhi, done with Pratyush Kumar in February 2024 in two milestones. The data is synthetic tabular data with 24 price-series style features per row (normalised open, high, low, close and volume, moving averages, a CMO and slope features) at three label-noise levels: a clean set of 7,800 rows, a low-noise set of 312,000 rows and a high-noise set of 249,600 rows. Each method predicts two targets, a 12-class era label and target_10_val, from a 70/15/15 train, test and validation split with seed 42.

Milestone 1 set a baseline MLP against two methods for noisy labels. Noise Attention Learning keeps the MLP and swaps the loss for the paper's attention-weighted loss, without its regularisation term. It helped where noise was present and hurt where it was not: on the era target, test accuracy went from 63.79% to 74.19% at low noise and from 44.90% to 49.75% at high noise, but fell from 76.41% to 42.05% on clean data. On target_10_val the gains were small (79.11% to 80.26% at low noise). Our SubTab port was partial: an autoencoder trained on overlapping feature subsets with the reconstruction loss only, no contrastive term, feeding an MLP with the NAL loss. It scored well below the baseline (15.07% on low-noise era) and the report says so.

Milestone 2 added TabPFN and a sequence model. TabPFN fits at most 1,000 rows and predicts at most 10 classes, so we fitted on a 1,000-row sample and chained two classifiers: the first is trained on classes 0 to 9, and any row it labels 9 goes to a second classifier trained on classes 9 to 11. It reached 85.31% test accuracy on clean era data and 74.83% on low-noise target_10_val, at the cost of prediction time (186.9 s for 1,500 test rows on low-noise era in the notebook). The sequence model is a one-layer LSTM over windows of 12 rows sorted by row_num with a classification head. LSTM and GRU scored almost the same, so the report gives one number. On the era target it beat TabPFN on noisy data (62.72% against 57.6% at low noise, 46.60% against 34.58% at high noise) and trailed it on clean data.

The repo is Pratyush's and all 13 commits are his; both reports list us as co-authors. The NAL MLP and TabPFN notebooks carry my laptop's run metadata, the RTX 3080 Ti both reports name as the hardware, and the SubTab and LSTM notebooks ran on a different machine with a GTX 1660 Ti. Two things I would fix now: the SubTab training loop prints a validation accuracy of 0.00000 every epoch, so its numbers are unverified, and the milestone 1 report says every model ran for 10 epochs while the committed NAL notebook is set to 5 and prints 47.71% on high-noise era where the report says 49.75%, so the reported numbers come from runs that are not the committed ones.
