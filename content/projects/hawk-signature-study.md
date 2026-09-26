---
title: Hawk signature study
blurb: "Report, talk and a working keygen, sign and verify demo of Hawk, the lattice signature scheme withdrawn from NIST standardisation in July 2026."
repo: https://github.com/happyc0der/hawk-signature-study
image: /img/hawk-signature-study.jpg
year: 2026
order: 19
featured: false
stack: [Python, NumPy, SymPy, Flask, pytest]
tags: [sec, swe]
stats: ["13-page report", "6 fixes to hawk-py", "~300x faster verify"]
bullets:
  - "Study of Hawk, the hash-and-sign lattice signature scheme withdrawn from NIST's Additional Digital Signatures process on 29 July 2026, for CS-UY 3943 Post-Quantum Cryptography at NYU Tandon: a 13-page report on the algorithms, parameters and security reductions, a talk, and a Flask server exposing key generation, signing and verification over a JSON API with a demo page."
  - "Applied six correctness fixes to the vendored hawk-py reference code, each with a reproduction in PATCHES.md and with regression tests for the decoder and sentinel bugs: NumPy 2 integer promotion that made every verification fail, decoder bounds and failure-path bugs that crashed instead of rejecting malformed input, and a modular exponentiation fix that made Hawk-256 verification about 300x faster (6.04 s to 0.02 s) and cut the test suite from 30 s to 2 s."
  - "Kept the report and slides unedited after the break and documented the attack beside them: a polynomial-time reduction of Hawk-n key recovery to SVP in dimension n/2 + 1 that took the claimed cost from 2^150 to 2^108 for Hawk-512 and 2^288 to 2^182 for Hawk-1024, with Hawk-256 keys recovered end to end by the attack's authors."
resume_bullets:
  - "Studied Hawk, the lattice signature scheme withdrawn from NIST standardisation in July 2026: a 13-page report, a talk, and a Flask keygen/sign/verify API with a demo page."
  - "Made six correctness fixes to the vendored hawk-py reference implementation, with regression tests; one sped up Hawk-256 verification about 300x (6.04 s to 0.02 s)."
  - "Documented the attack that broke it beside the unedited report: key recovery reduces to a lattice problem in half the dimension, cutting Hawk-512 from 2^150 to 2^108."
---

A course project for CS-UY 3943, Post-Quantum Cryptography, at NYU Tandon in spring 2026: a 13-page report on Hawk's algorithms, parameters, security reductions and cryptanalysis, a talk, and a Flask server that serves key generation, signing and verification as a JSON API with a demo page for an Alice to Bob walkthrough. The report and slides were submitted on 8 June 2026. Seven weeks later the scheme was broken and withdrawn. I have kept them exactly as submitted, with the break documented on a separate page next to them.

Hawk was a hash-and-sign signature over the power-of-two cyclotomic ring whose security rested on module-LIP rather than the SIS and LWE assumptions behind ML-DSA and Falcon. That diversity was its selling point, along with 555-byte Hawk-512 signatures and no floating point in signing or verification. On 28 July 2026 Straznickas and Weis published an unconditional polynomial-time reduction of Hawk-n key recovery to SVP in dimension n/2 + 1, roughly half the dimension the parameters were sized against, and the Hawk team withdrew the submission the next day. Claimed key-recovery cost fell from 2^150 to 2^108 for Hawk-512 and from 2^288 to 2^182 for Hawk-1024, and the authors recovered real Hawk-256 keys. My report had named the long-term hardness of smLIP over CM fields as the primary open question and said Hawk was poised for standardisation if that assumption held up over the next two years. It held up for seven weeks.

The demo vendors the hawk-py Python reference implementation, and getting it to run on current NumPy meant fixing it. NumPy 2 integer promotion made every verification fail, a decoder check used and where the specification says or so random input raised IndexError instead of being rejected, a length check compared bits against eight times the bit length and could never fire, and two failure paths returned the wrong sentinel and crashed instead of rejecting. Replacing `(g ** b) % p` with `pow(g, b, p)` in the root finder, which had been building a number of roughly 130 million bits before its first modular reduction, made Hawk-256 verification about 300x faster, 6.04 s to 0.02 s, and cut the test suite from 30 s to 2 s with bit-identical output. Every change is listed with a reproduction in `PATCHES.md`, and the tests cover round trips, spec-conformant encoded sizes, tampered messages, wrong keys, corrupted and truncated signatures and random garbage.

The server is a teaching tool. It keeps private keys in plaintext in process memory, has no authentication and binds to 127.0.0.1 on purpose. The vendored Python is not constant-time and 10 to 100x slower than the C implementation, so the timings in the README are illustrative. Nothing in the repository should be used to protect anything.
