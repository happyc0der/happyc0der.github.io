---
title: LFP2Vec audit
blurb: Reproduction of LFP2Vec (NeurIPS 2025) on public Neuropixels data, a preprocessing fix for its cross-lab failure, and two measurements the paper does not make.
repo: https://github.com/happyc0der/lfp2vec-audit
image: /img/lfp2vec-fixes.png
year: 2026
order: 3
featured: true
stack: [Python, PyTorch, Hugging Face transformers, wav2vec2, scikit-learn, SciPy, pytest, GitHub Actions]
tags: [ml, data]
stats: ["0.74 vs 0.68 published", "100 Hz low-pass fix", "337 tests, CI on push"]
bullets:
  - "Reproduced the fine-tuning stage of LFP2Vec (NeurIPS 2025) on public IBL and Allen Neuropixels data on a laptop: 0.74 ± 0.07 balanced accuracy over seven held-out IBL sessions against the paper's 0.68."
  - "Traced the cross-lab collapse to a preprocessing mismatch, spectra diverging up to 768-fold above 300 Hz, and showed a 100 Hz low-pass with no target-lab labels restores the published margin in one direction (+0.13 ± 0.03 vs +0.12) and most of it in the other (+0.08 ± 0.07 vs +0.11) over three seeds."
  - "Measured calibration under lab shift, which the paper calls for but does not report (ECE 0.10 in lab, 0.56 across labs, 0.35 after the fix), added an electrode-position control, and backed it with 337 tests, a leakage check before every training run and a synthetic smoke gate in CI."
resume_bullets:
  - "Reproduced LFP2Vec (NeurIPS 2025) fine-tuning on public IBL and Allen Neuropixels data on a laptop: 0.74 ± 0.07 balanced accuracy vs 0.68 published."
  - "Traced the cross-lab collapse to a preprocessing mismatch (spectra diverge 768x above 300 Hz); a 100 Hz low-pass restores the published margin."
  - "Measured calibration under lab shift (ECE 0.10 in lab, 0.56 across, 0.35 after the fix), added an electrode-position control; 337 tests in CI."
---

LFP2Vec (He et al., NeurIPS 2025) fine-tunes the audio model wav2vec2 on raw local field potential to say which brain region an electrode sits in, from three seconds of one channel. No pretrained weights were released, so I re-ran the fine-tuning stage on the two public datasets the paper uses, IBL and Allen Neuropixels, on an M4 Pro laptop. Within a lab it reproduces: 0.74 ± 0.07 balanced accuracy over all seven held-out IBL sessions against the paper's 0.68, and 0.81 with the paper's post-processing.

Trained on one lab and tested on the other, the model lands below the majority-class rate on every one of three seeds, predicting one class for 94% of the other lab's chunks at a mean confidence of 0.98. The cause is preprocessing, not the representation. The IBL pipeline band-passes at 0.5 to 300 Hz and the Allen release does not, so the mean spectra diverge up to 768-fold above 300 Hz and a linear probe recovers the source lab from the embeddings at AUC 0.997. Low-passing every input at 100 Hz, a corner I chose from the spectra before any cross-lab result existed, takes the post-processed margin to +0.13 ± 0.03 from Allen to IBL (published +0.12) and +0.08 ± 0.07 from IBL to Allen (published +0.11). An untrained audio checkpoint with a linear head on the same inputs does as well, in one eight-minute forward pass instead of two and a half hours per fine-tune.

The paper's Broader Impact section asks for calibrated uncertainty and reports none. Expected calibration error is 0.10 in lab and 0.56 across labs; a temperature fitted in lab barely moves the cross-lab number, and the target lab needed a temperature four to seven times larger. Matching the filters halves the error to 0.35. Electrode depth alone reaches 0.77 within IBL, where insertions are stereotyped, and chance across labs; fused with the signal as a product of experts the pair reaches 0.78 on IBL and 0.72 on Allen, at or above both parts.

Every training run passes a synthetic smoke test, a leakage check on its split and a throughput gate before it starts, and writes a manifest with the git commit, data hashes and seed before its first step. Of the 337 tests, the 320 that need no real data run in CI with an end-to-end smoke run on every push to main, and every table and figure regenerates from saved results. On 21 September 2026 I found that my electrode-position baseline had leaked test labels, retracted the claims that depended on it in a Corrections section of the README, and regenerated every table and figure. Much of the code was written with Claude Code, and the development notes list what I checked by hand.
