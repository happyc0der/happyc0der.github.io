---
title: mldsa-auth
blurb: Post-quantum mutual authentication and session protocol in C11, with a login daemon on top.
repo: https://github.com/happyc0der/mldsa-auth
year: 2026
order: 1
featured: true
stack: [C11, liboqs, libsodium, SQLite, CMake, libFuzzer, ProVerif, GitHub Actions]
tags: [sec, swe]
stats: ["0.45 ms handshake", "271 mutations nightly", "12 fuzz targets"]
bullets:
  - "Post-quantum mutual authentication and session protocol in C11: ML-DSA-65 signatures over a hybrid X25519 and ML-KEM-768 key exchange, HKDF-SHA256, and a padded ChaCha20-Poly1305 record layer."
  - "0.45 ms median handshake and 736 MiB/s record sealing on an M4 Pro; 40 tests in debug, ASan and UBSan builds on Linux and macOS, 12 libFuzzer targets and 271 must-kill mutations run nightly in CI."
  - "Built mldsa-authd on it, a login daemon with single-use login codes, device enrolment, revocation, key rotation and recovery codes, and a ProVerif model of the handshake, login and rotation."
resume_bullets:
  - "Built a post-quantum mutual authentication protocol in C11: ML-DSA-65 (FIPS 204) signatures over hybrid X25519 + ML-KEM-768, HKDF-SHA256, ChaCha20-Poly1305 records."
  - "Measured a 0.45 ms median handshake and 736 MiB/s record encryption; ASan/UBSan CI on Linux and macOS, 12 libFuzzer targets, nightly mutation testing (271 must-kill mutations)."
  - "Built mldsa-authd, a login service on it: login codes, device enrolment, revocation, key rotation, recovery codes; ProVerif model of the handshake."
---

Two parties prove who they are with ML-DSA-65 (FIPS 204) signatures, agree a key from X25519 and ML-KEM-768 together, then talk over a padded ChaCha20-Poly1305 record layer. The specification lives beside the code and every design decision is written down in a decision log. Dependencies are pinned by hash or commit and built from source, so a clean checkout builds identical bits.

`mldsa-authd` turns the protocol into a login system. A device authenticates with the handshake and gets a single-use login code, which the site exchanges over a local Unix socket for an opaque session token, so the token never reaches browser JavaScript. Devices can be enrolled, revoked and rotate their keys, a lost device is replaced with a recovery code, and browsers reach the daemon as a WebSocket behind a TLS proxy that states the client address in a PROXY v2 preamble the daemon rate-limits on. It is installable but not deployed: the runbook from an empty VPS to a first login exists, and nobody has run it against a real host yet.

I do not trust a test I have not seen fail. Every push runs the 40-test suite in debug, ASan and UBSan builds on Linux and macOS. Every night, 271 must-kill mutations across 27 campaigns run against a fresh ASan tree, each of the 12 fuzz targets runs for 600 s, and a ProVerif model must prove mutual agreement, session-key secrecy, login-code secrecy and rotation binding while eight derived variants are checked too: three that leak one secret must still prove, and five that remove a check must fail. Each CI gate was shown to go red by breaking it on purpose before it was trusted.

Measured, not estimated: 0.45 ms median hybrid handshake in process on an Apple M4 Pro against a 15 ms target, 0.78 to 1.02 ms on GitHub's shared x86_64 runners, and 736 MiB/s record sealing at 64 KiB. The README says plainly that it is not production-ready: trust is manual key pinning with no CA, and the library is single-threaded by design.
