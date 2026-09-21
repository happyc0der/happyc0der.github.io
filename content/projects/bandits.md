---
title: Non-stationary bandits
blurb: Five bandit algorithms for changing environments, benchmarked on one interface.
repo: https://github.com/happyc0der/multi_armed_bandit_algorithms
year: 2026
order: 13
featured: false
stack: [Python, numpy]
tags: [quant, ml]
stats: ["5 algorithms", "59x faster AdSwitch", "regret 21,860 to 174"]
bullets:
  - "Five non-stationary bandit algorithms (TS-GE, AdSwitch, M-UCB, UCB1, epsilon-greedy) behind one interface with a regret benchmark."
  - "Fixed a reversed Beta update in TS-GE: regret 21,860 to 174. Showed forced probing is 76% of its total regret."
  - "Made AdSwitch 59x faster (218 s to 3.7 s) with bit-identical output."
---

Bandits where the best arm changes over time. Started in 2022 with markets in mind, rewritten this year.

The benchmark splits regret into decision regret and the cost of mandatory probing, which turns out to be most of it for TS-GE.
