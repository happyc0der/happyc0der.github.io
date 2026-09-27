---
title: EEG dementia re-evaluation
blurb: "Honest, subject-level re-evaluation of a course project that classified Alzheimer's, frontotemporal dementia and healthy controls from EEG: about 60% balanced accuracy, and no deep model beats spectral features."
repo: https://github.com/happyc0der/eeg-dementia-graph-transformer
image: /img/eeg-dementia.png
year: 2026
order: 3.5
featured: true
team: 4
credit: "The Spring 2025 project was a team of four in NYU's Neuroinformatics course: Subhrajit Dey (subro608 on GitHub), who wrote most of the original graph-transformer model and training code, Sirish Visweswar, terka2610 and me. It is kept unchanged in the repository's legacy folder. The 2026 re-evaluation is mine: the subject-level evaluation harness, the 16 feature pipelines, the foundation-model and CNN comparisons, the statistics and the tests."
resume_credit: "2025 team course project (4 people); the 2026 re-evaluation, harness, models and statistics are mine."
stack: [Python, PyTorch, braindecode, MNE, scikit-learn, LightGBM, pyRiemann, uv, pytest]
tags: [ml, data]
stats: ["88 subjects, 10x5-fold nested CV", "61.1% vs 33% chance", "no deep model beats features"]
bullets:
  - "Re-evaluated a course project that reported 63.6% accuracy for Alzheimer's (AD), frontotemporal dementia (FTD) and controls from resting EEG after model selection leaked subjects (99% validation accuracy): every split is now over subjects, with nested model selection, 10 repeats of 5-fold CV, bootstrap CIs and permutation tests."
  - "Compared 16 feature pipelines with EEG foundation models (LaBraM, CBraMod, BIOT) and CNNs under one protocol, pre-registered for the deep models: the best pre-specified model reaches 61.1 ± 3.0% subject-level balanced accuracy (chance 33%), and no deep model beats it; AD vs controls reaches 84.6%, AD vs FTD stays near 60%."
  - "Found that 92% of every channel's variance in the distributed recordings is one common-mode artefact, which the average reference removes; leakage tests with spy estimators, and a test that fails if the README tables and the result files disagree."
resume_bullets:
  - "Re-evaluated a course project on classifying Alzheimer's, frontotemporal dementia and controls from EEG (88 subjects): subject-level splits, nested model selection, 10x5-fold CV, bootstrap CIs, permutation tests."
  - "Compared 16 feature pipelines with EEG foundation models (LaBraM, CBraMod, BIOT) and CNNs, pre-registered: best model 61.1% balanced accuracy vs 33% chance, and no deep model beat spectral features."
  - "Found a common-mode artefact holding 92% of each channel's variance and removed it with an average reference; spy-estimator leakage tests and README tables checked against result files."
---

The project started in Spring 2025 in NYU's Neuroinformatics course: a graph transformer that classified Alzheimer's disease (AD), frontotemporal dementia (FTD) and cognitively normal controls from resting-state EEG on the public OpenNeuro ds004504 dataset (88 subjects, 19 channels). It reported 63.6% accuracy on one 18-subject test split, after model selection on 15-second chunks that put chunks of the same recording in both training and validation, which is why validation accuracy was 99%.

In 2026 I re-evaluated the task properly. Every split is made over subjects, hyper-parameters are chosen by an inner cross-validation on the training subjects only, and every model runs through 10 repeats of 5-fold cross-validation with subject-level metrics, class-stratified bootstrap confidence intervals and permutation tests of the whole nested pipeline. Honest three-class performance is about 60% subject-level balanced accuracy against 33% chance. The best pre-specified model, a soft vote of a spectral logistic regression, a Riemannian model and LightGBM, reaches 61.1 ± 3.0% [53.6, 68.0].

The second phase, written down before any outer-fold run, compared that with EEG foundation models (frozen and fine-tuned CBraMod, frozen LaBraM and BIOT) and CNNs trained from scratch (EEGNet, ShallowFBCSPNet). None beats the feature models: frozen LaBraM with a linear head reaches 61.3%, ShallowFBCSPNet 60.3%, and three deep models are significantly worse. With about 70 training subjects per fold the networks memorise subjects within a few epochs, and what the classifiers use is the EEG slowing of dementia that band power already captures. AD vs controls works (84.6% leave-one-subject-out, in line with rigorous studies), FTD vs controls reaches 78.8%, but AD vs FTD stays near 60% with every representation tried.

Along the way I found that about 92% of every channel's variance in the recordings as distributed is one common-mode signal, mostly below 2 Hz and identical across groups; the original pipeline z-scored it into most of its input, and the average reference removes it. Spy estimators in the tests check that no fit call ever sees a test subject, and a test fails if any README table disagrees with the result files. The limitations are in the README: one site, 23 FTD patients, and deep models run at pre-registered defaults rather than tuned.
