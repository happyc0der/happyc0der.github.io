---
title: Telecom churn
blurb: "Nine scikit-learn churn models with tuned thresholds behind a Streamlit app, with tests and CI added to a forked college project."
repo: https://github.com/happyc0der/customer-churn-prediction
image: /img/customer-churn.jpg
year: 2026
order: 25
featured: false
credit: "Forked from codebrain001/customer-churn-prediction. The original app, notebook and dataset are codebrain001's. The model gallery, the threshold study, the tests, the CI and the bug fixes are mine."
stack: [Python, scikit-learn, pandas, Streamlit, pytest, ruff, GitHub Actions]
tags: [ml, data, swe]
stats: ["9 models", "62 tests", "recall 0.578 to 0.751"]
bullets:
  - "Rebuilt a forked telecom churn predictor as a gallery of nine scikit-learn models on the 7,043-row Telco dataset, each with preprocessing inside the pipeline and its own tuned decision threshold, selectable in a Streamlit app."
  - "Swapped the original logistic regression at a 0.5 cut-off for gradient boosting at 0.31, catching 281 of 374 held-out churners instead of 216 (recall 0.578 to 0.751) while accuracy fell from 0.805 to 0.767."
  - "Wrote 62 pytest tests, most pinned to a bug the project had shipped and checked by putting the bug back, plus a GitHub Actions workflow that runs ruff and the suite on Python 3.11 and 3.13."
resume_bullets:
  - "Rebuilt a forked telecom churn predictor as nine scikit-learn models on the 7,043-row Telco dataset, each with a tuned threshold, behind a Streamlit app."
  - "Gradient boosting at a 0.31 cut-off catches 281 of 374 held-out churners instead of 216 (recall 0.578 to 0.751) at accuracy 0.805 to 0.767."
  - "62 pytest tests, most pinned to a shipped bug; GitHub Actions runs ruff and the suite on Python 3.11 and 3.13."
---

This is codebrain001's Streamlit churn predictor, which I forked in 2022 for coursework. The upstream project stopped in August 2021. In September 2026 I went back over it: 18 of the 56 commits are mine, all from that pass, and the exploratory notebook, the dataset and the shape of the app are the original author's.

The original shipped one logistic regression, trained on a 70/30 split with scaling fitted before the split. `train.py` now holds out a stratified 20% test set, keeps imputation, scaling and one-hot encoding inside each pipeline, searches nine algorithms with randomised search and 5-fold cross-validation, selects on average precision (about 26.5% of customers churn, so accuracy is the wrong yardstick) and tunes a decision threshold per model for F1. Any of the nine can be picked in the app, a compare mode scores an uploaded CSV with all of them, the whole gallery is about 6 MB, and a retrain is deterministic and takes about a minute.

The result is plain: eight of the nine models sit within 0.015 F1 of each other and only naive Bayes trails. The threshold moved more than the algorithm. Against the original logistic regression at 0.5, gradient boosting at 0.31 catches 281 of the 374 test-set churners instead of 216, and accuracy drops from 0.805 to 0.767. For a retention campaign that is the trade I wanted: a false alarm is cheap, a missed churner is not.

The 62 tests cover preprocessing, the saved models, the app through Streamlit's own AppTest, the notebook and `train.py`. They were validated by reintroducing the ten shipped bugs they guard one at a time and confirming the suite went red. One of those bugs was a `--only` flag that quietly deleted eight of the nine model files while the linter passed clean. Lint and tests run in GitHub Actions on Python 3.11 and 3.13.
