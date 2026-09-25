---
title: Snakes and Ladders as a Markov chain
blurb: Exact game length of Snakes and Ladders from the fundamental matrix, checked against a dice simulation and 47 tests.
repo: https://github.com/happyc0der/SPA_Project
year: 2022
order: 23
featured: false
credit: Aman Kumar wrote the empirical transition-matrix tally in the original 2022 simulation.
stack: [Python, numpy, matplotlib, pytest]
tags: [quant]
stats: ["39.6 turns expected", "d15 is fastest", "47 tests"]
bullets:
  - "Modelled Snakes and Ladders as a 101-state absorbing Markov chain in numpy and computed the exact expected game length, 39.6 turns on a six-sided die, as a row sum of the fundamental matrix (I - Q)^-1."
  - "Checked the matrix against a brute-force dice simulation and swept die sizes from d2 to d24: a 15-sided die gives the shortest game at 25.8 turns, a d20 is slower than a d12, and a one-sided die can never win."
  - "Reworked the 2022 coursework in 2026 with 47 pytest tests that pin the exact expectation, the completion curve, the reachable squares and the simulation against the chain."
resume_bullets:
  - "Snakes and Ladders as a 101-state absorbing Markov chain: exact expected game length 39.6 turns from the fundamental matrix (I - Q)^-1."
  - "Checked against a dice simulation; a die-size sweep from d2 to d24 finds a 15-sided die fastest at 25.8 turns and a one-sided die unwinnable."
  - "Reworked the 2022 coursework in 2026 with 47 pytest tests pinning the expectation, completion curve and simulation against the chain."
---

The board is squares 0 to 100 with 19 snakes and ladders, and a roll past 100 is not played, so the player stays put and loses the turn. Where you land depends only on where you are, which makes the game a 101-state Markov chain with square 100 absorbing. One 101 by 101 transition matrix then answers every question exactly. Removing the absorbing square leaves Q, and the row sums of the inverse of I - Q are the expected turns from each square: 39.5984 from the start with a fair d6. The fewest turns a win can take is 7, half of games are over by turn 33, and 99% by turn 130. This started as Stochastic Processes coursework at IIIT Delhi.

Two things fell out of the die sweep. A bigger die helps only up to a point: d6 takes 39.60 turns, d8 31.97, d15 25.84, and then the house rule bites, since more rolls near the end are too big to play, so a d20 (27.22) is already slower than a d12 (27.07). A d3 is slower than a d2 (81.18 against 72.01) because its reachable squares line up badly with the snakes. With a d1 the board cannot be won at all: the player walks 26 to 47, lands on the snake at 48, returns to 26, and repeats, with only 18 squares reachable. Every snake and ladder head is unreachable, so 82 of the 101 squares can end a turn, and the stationary distribution is all mass on square 100, which T^n reaches to within 1e-4 at n = 165.

`simulation.py` plays games by rolling a die and tallies an empirical transition matrix to compare with the analytic one; the two agree to within sampling noise, and the simulated mean game length lands within the 5% tolerance the test allows around the exact 39.5984. I went back over the repo in September 2026, fixed bugs in the model and the simulation, and added 47 tests. One fix worth noting: the average-position figure had been plotting the tail of a single long game as if it were signal, so it is now cut at the last turn backed by at least 30 games and relabelled as the mean square of games still in play.
