---
title: mldsa-auth
blurb: Post-quantum mutual authentication and session protocol in C11.
repo: https://github.com/happyc0der/mldsa-auth
year: 2026
order: 1
featured: true
stack: [C11, liboqs, libsodium, SQLite, CMake, libFuzzer]
tags: [sec, swe]
stats: ["0.45 ms handshake", "736 MiB/s records", "11 fuzz targets"]
bullets:
  - "Post-quantum mutual authentication and session protocol in C11: ML-DSA-65 signatures over hybrid X25519 + ML-KEM-768."
  - "0.45 ms median handshake; ChaCha20-Poly1305 record layer at 736 MiB/s."
  - "11 libFuzzer targets, 169 mutation tests, ASan/UBSan CI on Linux and macOS; login daemon with device enrolment and revocation."
---

Two parties prove who they are with ML-DSA-65 (FIPS 204) signatures, agree on a key with X25519 and ML-KEM-768 together, then talk over a padded ChaCha20-Poly1305 record layer.

On top of the protocol sits `mldsa-authd`, a daemon that turns it into a login system: single-use login codes, session tokens, device enrolment, revocation, key rotation and recovery codes.

Dependencies are pinned by hash and built from source. The README says plainly that it is not production-ready.
