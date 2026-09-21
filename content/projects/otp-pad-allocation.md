---
title: One-time-pad allocation
blurb: Wait-free pad allocation for m parties with perfect secrecy.
repo: https://github.com/happyc0der/cryptography-project-1
year: 2025
order: 10
featured: false
team: 3
stack: [Python, pytest]
tags: [sec]
stats: ["36 vs 4,000 wasted pads", "310 tests", "team of 3"]
bullets:
  - "Wait-free one-time-pad allocation protocol for m parties, with proofs that no pad is ever reused."
  - "Closed-form waste bound independent of n: 36 wasted pads against 4,000 for static partitioning (m=5, n=5000)."
  - "Found two bugs in the assigned reference protocol; 310 tests, and CI re-checks the published results."
---

Parties share a pool of one-time pads and must never use the same pad twice, without waiting on each other. Our protocol reserves pads in chunks and wastes at most d(2m-1) - m + (n mod d) of them, however large the pool.

Applied Cryptography at NYU, team of three. The 15-page report is in the repo.
