---
title: Customer attrition
blurb: "Four-person IIIT Delhi machine learning course project comparing eight classifiers for telecom churn, and why its reported accuracy does not hold up."
repo: https://github.com/IshitBajpai/ML_Project
year: 2022
order: 29
featured: false
team: 4
credit: "The repo is Ishit Bajpai's (IshitBajpai on GitHub). The project was a team of four: Ishit Bajpai, Keshav Rajput, Prachi and Satyam Arora, with equal credit stated in the report. My share was debugging, result analysis, the train and test split, PCA and t-SNE, the dataset handling and the report. All 3 commits are Ishit's uploads of the group's notebooks, slides and report."
stack: [Python, scikit-learn, XGBoost, pandas, seaborn, Jupyter, Google Colab]
tags: [ml, data]
stats: ["7,043 rows, 38 columns", "8 classifiers", "team of 4"]
bullets:
  - "Machine learning course project at IIIT Delhi in a team of four: churn prediction on the Maven Analytics telecom dataset of 7,043 customers and 38 columns, comparing logistic regression, two naive Bayes variants, SVM, random forest, AdaBoost, XGBoost and an MLP, most under 5-fold cross-validation."
  - "My share was debugging, result analysis, the 75:25 stratified split, PCA and t-SNE, the dataset handling and the report; the group reported an RBF-kernel SVM as best at 96.72% accuracy and 93.51 F1."
  - "The reported scores are inflated by target leakage: the Churn Category and Churn Reason columns, filled only for churners, stayed in the feature matrix, and the ROC-AUC helper fitted each model on the test set it then scored."
resume_bullets:
  - "IIIT Delhi ML course project, team of four: churn prediction on 7,043 telecom customers and 38 columns, eight classifiers, most under 5-fold cross-validation."
  - "Owned debugging, result analysis, the stratified split, PCA and t-SNE, and the report; the group reported an RBF SVM at 96.72% accuracy."
  - "The reported scores are inflated by target leakage: churn-reason columns left in the features and ROC-AUC fitted on the test set."
---

This was the final project for CSE/ECE 343 Machine Learning at IIIT Delhi, submitted on 4 December 2022 by a team of four: Ishit Bajpai, Prachi, Satyam Arora and me. The repository is Ishit's and holds the group's four Colab notebooks, the slides and the report. The task was to predict which telecom customers churn. The data is the Maven Analytics telecom churn set: 7,043 customers from one quarter of 2022, 38 columns, and a three-way status of joined, stayed or churned that we collapsed to churned (1,869 customers) against the rest (5,174). Per the slides, my share was debugging, result analysis, the train and test split, PCA and t-SNE, the dataset handling and the report.

The pipeline drops the customer ID, fills missing values with a KNN imputer (the report says mean for numeric columns, but that line in the notebook never assigns its result), label-encodes every categorical column, removes any feature correlated above 0.85 with another, drops low-variance numeric columns, standardises, and reduces to 8 principal components. The split is 75:25 and stratified. We then ran logistic regression, Gaussian and Bernoulli naive Bayes, SVM with four kernels, random forest, AdaBoost and XGBoost with small grid searches, and an MLP with hidden layers of 256 and 32, scoring the scikit-learn models with 5-fold cross-validation and the MLP on the held-out quarter. The group's table put the RBF SVM first at 96.72% accuracy and 93.51 F1, with XGBoost highest on ROC-AUC at 99.8.

Those numbers do not hold up, and it is better to say so here than let them stand. The Maven set has two columns, Churn Category and Churn Reason, that are blank unless the customer churned. The notebooks fill them with a placeholder for everyone else and then keep both in the feature matrix, so the inputs to PCA, and through it to every model, carried a column that is zero exactly when the label is zero. On top of that, the ROC-AUC helper fits each model on the test set and scores the same rows, and PCA is fitted separately on the train and test halves. For comparison, my 2026 Telecom churn project on a 7,043-row Telco dataset without those columns reaches accuracy between 0.767 and 0.805 depending on the model and threshold.

Most of the semester went into preprocessing and rerunning results, and every model looked good because the leak made every model look good. The later project keeps each preprocessing step inside a scikit-learn pipeline and holds out the test set before anything is fitted, which is the fix for both problems.
