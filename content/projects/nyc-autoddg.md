---
title: NYC AutoDDG
blurb: PySpark profiler and local-LLM description generator for NYC Open Data, with benchmarks of where Spark beats pandas.
repo: https://github.com/happyc0der/nyc-autoddg
image: /img/autoddg-scaling.png
year: 2026
order: 15
featured: false
stack: [Python, PySpark, pandas, PyArrow, Ollama, Databricks, rank-bm25, pytest]
tags: [data, ml]
stats: ["4.8M rows in 2.3 min", "97% claims grounded", "+12 pts Recall@1"]
bullets:
  - "Built a single-pass PySpark profiler that infers column types, statistics, semantic types and data-quality flags for 100 NYC Open Data datasets (4.8M rows) in 2.3 min, down from 12 min, verified against a pandas oracle by 7 tests."
  - "Benchmarked Spark on an M4 Pro and Databricks serverless: near-linear speedup to 8 cores, a Spark vs pandas crossover at 1.7M rows, and pandas across 14 processes 14x faster than the best Spark setup on the small-file catalog."
  - "Generated AutoDDG-style descriptions with a local qwen3:14b from the profile alone; 97% of checkable claims matched the profile, and appending the search-focused one to portal metadata raised Recall@1 on tag queries from 0.605 to 0.728."
resume_bullets:
  - "Built a single-pass PySpark profiler (types, statistics, semantic types, data-quality flags) for 100 NYC Open Data datasets: 4.8M rows in 2.3 minutes, down from 12; checked against a pandas oracle with pytest."
  - "Benchmarked Spark against pandas on an M4 Pro and Databricks serverless over Parquet: crossover at 1.7M rows, near-linear scaling to 8 cores, pandas 14x faster on small files."
  - "Had a local qwen3:14b model write dataset descriptions from the profiles; 97% of checkable claims matched the data, and search Recall@1 rose from 0.605 to 0.728."
---

NYC Open Data publishes about 2,400 datasets, and their descriptions are thin: across the 100 I sampled, the median is 69 words and names 7% of the columns. AutoDDG (Zhang et al., 2025) profiles a dataset and prompts an LLM for a user-focused and a search-focused description. I built the profiling half on Spark, ran the LLM stage on a free local model, and measured where each choice paid off. It was a one-week Big Data course project on a 24 GB M4 Pro shared with other jobs.

The profiler computes integer, float, timestamp, boolean and text statistics for every column in one aggregation and decides the type afterwards from parse-success ratios. Three code decisions beat adding cores beyond 8: parsing only values whose shape matches a regex, so failed casts never happen (about 5x), one pass instead of one job per statistic (1.9 to 2.8x), and running jobs for small files concurrently (4x). Profiles also carry data-quality flags, such as 1900-01-01 placeholder dates and ZIP codes outside NYC, that the LLM turns into caveats. A pandas reimplementation is the single-node baseline and the test oracle.

Speedup is near-linear to 8 cores (6.4x on 3.46M rows), and 14 cores are slower than 8, because the input is 16 Parquet row groups that Spark cannot split and the M4 Pro's efficiency cores become stragglers; rewriting the data as 56 files plus speculative execution matched the 8-core time but never beat it. Spark passes pandas at about 1.7M rows, and for the 100 small catalog datasets pandas across 14 processes took 6.6 s against 92 s for the best Spark configuration. Databricks serverless was 20% faster than the laptop on the 3.46M-row dataset and 2.3 to 4.7x slower on twenty small ones. The benchmark harness waits for a quiet machine, re-checks after each run, and records load on every row.

qwen3:14b wrote both descriptions for all 100 datasets from the profile alone, never seeing the original text. Of 295 checkable claims in the user-focused descriptions, 97.3% matched the profile (97.8% of 180 in the search-focused ones), and most of the 12 flagged across both were checker false positives such as rounding. A separate llama3.1:8b judge scored the generated descriptions higher on completeness and readability than the portal's own. With BM25 over tag-based queries, appending the search-focused description to the original metadata raised Recall@1 from 0.605 to 0.728, while replacing the originals did not hold up, since they still won on queries derived from their own wording.
