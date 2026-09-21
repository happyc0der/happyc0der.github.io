---
title: Snakes and Ladders as a Markov chain
blurb: Exact game length from the fundamental matrix, checked by simulation.
repo: https://github.com/happyc0der/SPA_Project
year: 2022
order: 14
featured: false
stack: [Python, numpy]
tags: [quant]
stats: ["39.6 turns expected", "d15 is fastest", "47 tests"]
bullets:
  - "Snakes and Ladders as a 101-state absorbing Markov chain; expected game length 39.6 turns from the fundamental matrix."
  - "Cross-checked by Monte Carlo; a die-size sweep finds a 15-sided die is fastest (25.8 turns). 47 tests."
---

A game takes 39.6 turns on average, 7 at the very least, and 99% finish by turn 130. With a one-sided die you can never win: square 100 is not reachable.

Stochastic Processes coursework at IIIT Delhi.
