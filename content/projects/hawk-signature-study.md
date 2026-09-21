---
title: Hawk signature study
blurb: A study of Hawk, the post-quantum signature scheme broken in July 2026.
repo: https://github.com/happyc0der/hawk-signature-study
year: 2026
order: 11
featured: false
stack: [Python, NumPy, Flask]
tags: [sec]
stats: ["13-page report", "6 fixes", "~300x faster verify"]
bullets:
  - "Report and talk on Hawk, the lattice signature scheme broken and withdrawn from NIST standardisation in July 2026."
  - "Working keygen/sign/verify demo; six fixes to the reference Python code, one making verification about 300x faster."
---

Written for Post-Quantum Cryptography at NYU in June 2026. Seven weeks later the scheme was broken: key recovery for Hawk-256 went from 2^62 to 2^38. The report is published unedited, with the break documented next to it.
