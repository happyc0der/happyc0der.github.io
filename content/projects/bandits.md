---
title: Non-stationary bandits
blurb: Five bandit algorithms for changing environments, benchmarked on one interface with regret split into decisions and mandatory probing.
repo: https://github.com/happyc0der/multi_armed_bandit_algorithms
year: 2026
order: 23
featured: false
stack: [Python, NumPy, Matplotlib]
tags: [ml, quant]
stats: ["5 algorithms", "59x faster AdSwitch", "regret 21,860 to 174"]
bullets:
  - "Five piecewise-stationary bandit algorithms (TS-GE, AdSwitch, M-UCB, UCB1, epsilon-greedy) behind one interface, benchmarked on five cases from 2 to 128 arms with regret split into decision regret and mandatory probing cost."
  - "Audited TS-GE against its paper and found the Beta update reversed, which cut TS-phase regret from 21,860 to 174 at K=2, T=6000, and showed mandatory probing is 75.9% of its total regret on that case."
  - "Made AdSwitch 59x faster (218.6 s to 3.7 s at K=16, T=1e5) and cut memory from 2,048 MB to 272 MB at K=128, T=1e6, with bit-identical output."
resume_bullets:
  - "Implemented five piecewise-stationary bandit algorithms (TS-GE, AdSwitch, M-UCB, UCB1, epsilon-greedy) behind one interface and benchmarked them from 2 to 128 arms."
  - "Audited TS-GE against its paper and found its Beta update reversed; fixing it cut TS-phase regret from 21,860 to 174, and showed mandatory probing causes 75.9% of its total regret."
  - "Made AdSwitch 59x faster (218.6 s to 3.7 s) and cut its memory from 2,048 MB to 272 MB at K=128, T=1e6, with bit-identical output."
---

Bandits where the best arm changes over time. I started the repo in 2022 with financial markets in mind and rewrote it in September 2026. Five algorithms (TS-GE, AdSwitch, M-UCB, UCB1 and epsilon-greedy) implement one interface and run on one bounded synthetic environment, across five benchmark cases from 2 to 128 arms.

TS-GE's paper requires it to probe every arm every episode, and the regret definition charges each probe slot no matter how well the algorithm is learning. So the benchmark reports total regret, decision regret and maximum probe age separately. At K=2, T=6000, mandatory probing is 75.9% of TS-GE's total regret, and at T=200,000 it is 98.5%. On decision regret TS-GE beats M-UCB from K=16 upward, 4.3x at K=16, and at K=16 it detects a change in 188 slots against 716 for M-UCB and 4,960 for AdSwitch. On total regret it loses, so reporting only the total inverts the conclusion.

Auditing TS-GE against its paper, I found the Beta update written backwards: as printed, the sampled value is the failure rate, so the algorithm picks the arm most likely to fail. At K=2, T=6000, seed 42, TS-phase regret is 21,860 as written and 174 corrected. I also gate post-change resets on fresh pulls of the localized arm, which took committed resets on a stationary run from 15, 10 and 13 across three seeds to zero, and a preflight check refuses parameter sets where a change cannot be detected or initialization would take more than half the horizon.

AdSwitch's evicted-arm test, evaluated naively, is O(K T^2) and was 89 to 96% of wall time. Restricting it to rounds where the arm was pulled and to that arm's own pull times, with sparse per-arm prefix sums, gives 59x at K=16, T=1e5 (218.6 s to 3.7 s) and 272 MB instead of 2,048 MB at K=128, T=1e6, with chosen arms, detections and evictions bit-identical. AdSwitch's run-to-run spread reaches 18x depending on which arm changed, so the summary carries median and quartiles beside the mean.
