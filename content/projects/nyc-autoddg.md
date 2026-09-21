---
title: NYC AutoDDG
blurb: Spark profiler plus a local LLM that writes descriptions for NYC Open Data.
repo: https://github.com/happyc0der/nyc-autoddg
year: 2025
order: 9
featured: false
image: /img/autoddg-scaling.png
stack: [PySpark, Databricks, Ollama, pandas]
tags: [data, ml]
stats: ["4.8M rows in 2.3 min", "97% grounded", "+12 Recall@1"]
bullets:
  - "PySpark profiler plus a local LLM that writes searchable descriptions for NYC Open Data datasets."
  - "100 datasets, 4.8M rows profiled in 2.3 min, down from 12; measured the Spark vs pandas crossover at 1.7M rows."
  - "97% of checkable facts in the descriptions are backed by the profile; +12 points Recall@1 on dataset search."
---

Descriptions on the portal are short and name about 7% of a dataset's columns. This profiles each dataset, hands the profile to a local model, and checks what comes back against the numbers.

Spark only wins above about 1.7M rows. For a hundred small datasets, plain pandas across 14 processes was 14x faster. Big Data course project.
