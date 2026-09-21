---
title: LFP2Vec audit
blurb: Reproduction and audit of a NeurIPS 2025 brain-region model on public Neuropixels data.
repo: https://github.com/happyc0der/lfp2vec-audit
year: 2026
order: 3
featured: true
image: /img/lfp2vec-fixes.png
stack: [Python, PyTorch, wav2vec2, GitHub Actions]
tags: [ml]
stats: ["0.72 vs 0.68 published", "cross-lab fix", "300+ tests"]
bullets:
  - "Reproduced LFP2Vec (NeurIPS 2025) on public IBL and Allen Neuropixels data: 0.72 balanced accuracy vs 0.68 published."
  - "Found cross-lab transfer falls to chance (0.24) because of a high-frequency preprocessing mismatch; a 100 Hz low-pass brings it back to 0.46."
  - "Added calibration under lab shift (ECE 0.56 to 0.35), 3-seed error bars and 300+ tests."
---

LFP2Vec predicts which brain region an electrode is in from 3 seconds of raw LFP. I re-ran the fine-tuning on public data and then measured two things the paper does not: calibration when the lab changes, and how much electrode position alone explains.

Trained on one lab and tested on the other, the model is at chance. The two labs' spectra differ by up to 768x above 300 Hz, and a classifier can tell the labs apart with AUC 0.997. Low-passing at 100 Hz fixes most of it.

The repo has a corrections section where I retract an earlier result that leaked a feature.
