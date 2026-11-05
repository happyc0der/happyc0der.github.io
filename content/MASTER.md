# Keshav Rajput: master data

Generated from content/ on 2026-11-05. Do not edit; edit the source files and run `npm run master`.

## Profile

- MS CS, NYU Tandon. I build systems, cryptography and ML things, and I measure them.
- New York, NY, keshav.rajput4@gmail.com, +1 (646) 299-9431
- https://github.com/happyc0der
- https://www.linkedin.com/in/happyc0der/
- https://happyc0der.github.io

## Education

- New York University, Tandon School of Engineering: Master of Science (MS) in Computer Science, Sep 2024 - May 2026. GPA 3.67/4.0
- Indraprastha Institute of Information Technology (IIIT) Delhi: Bachelor of Technology (B.Tech) in Computer Science and Applied Mathematics, minor in Economics, 2020 - 2024. CGPA 8.19/10

## Competitions

- Biohub Cell Tracking, Kaggle (2026): Final rank 591 of 3,947 teams (top 15%); private leaderboard 0.918, public 0.952
- Kaggle Playground S6E9 (2026): Out-of-fold AUC 0.9465 from nested target encodings, a LightGBM, CatBoost and MLP blend and 192 experiments judged by paired DeLong tests. Final rank 287 of 3,575 teams (top 9%), private AUC 0.94545
- Gemma 4 Developer Agent, Kaggle (Google DeepMind) (2026): LLM agent entry in Google ADK; local evaluation harness with Docker sandboxes and tool calls, served by vLLM and llama.cpp. In progress, ends Dec 2, 2026
- TrafficFlowBench (2026): Public leaderboard 0.892 against a 0.553 baseline (LightGBM queue forecasts, PyTorch U-Nets, an NNLS origin-destination solver). In progress, ends Nov 7, 2026
- Money Talks 2, AI x Fintech Hackathon (Block Convey), Money Operations track (2026): Solo entry Ledger, a forecast agent that checks every claim against the CRM; 94% recall and 0 false alarms on 235 deals. Result pending
- Deal Flow, NYC's first VC hackathon (Betaworks), Track 3 Portfolio (2026): Team entry Portfolio Pulse with Utkarsh Mittal, VC portfolio monitoring with rule-based signals and cited drafts. Did not win

## Projects (44)

### mldsa-auth (`mldsa-auth`)

Post-quantum mutual authentication and session protocol in C11, with a login daemon on top.

- 2026 · featured · tags: sec swe · resumes: swe sec
- https://github.com/happyc0der/mldsa-auth
- stack: C11, liboqs, libsodium, SQLite, CMake, libFuzzer, ProVerif, GitHub Actions
- stats: 0.45 ms handshake · 384 mutations nightly · 12 fuzz targets
- Post-quantum mutual authentication and session protocol in C11: ML-DSA-65 signatures over a hybrid X25519 and ML-KEM-768 key exchange, HKDF-SHA256, and a padded ChaCha20-Poly1305 record layer.
- 0.45 ms median handshake and 736 MiB/s record sealing on an M4 Pro; 53 tests in debug, ASan and UBSan builds on Linux and macOS, 12 libFuzzer targets and 384 must-kill mutations run nightly in CI.
- Built mldsa-authd on it, a login daemon with single-use login codes, device enrollment, revocation, key rotation and recovery codes, and a ProVerif model of the handshake, login and rotation.

Two parties prove who they are with ML-DSA-65 (FIPS 204) signatures, agree a key from X25519 and ML-KEM-768 together, then talk over a padded ChaCha20-Poly1305 record layer. The specification lives beside the code and every design decision is written down in a decision log. Dependencies are pinned by hash or commit and built from source, so a clean checkout builds identical bits.

`mldsa-authd` turns the protocol into a login system. A device authenticates with the handshake and gets a single-use login code, which the site exchanges over a local Unix socket for an opaque session token, so the token never reaches browser JavaScript. Devices can be enrolled, revoked and rotate their keys, a lost device is replaced with a recovery code, and browsers reach the daemon as a WebSocket behind a TLS proxy that states the client address in a PROXY v2 preamble the daemon rate-limits on. It is installable but not deployed: the runbook from an empty VPS to a first login exists, and nobody has run it against a real host yet.

I do not trust a test I have not seen fail. Every push runs the 53-test suite in debug, ASan and UBSan builds on Linux and macOS. Every night, 384 must-kill mutations across 57 campaigns run against a fresh ASan tree, each of the 12 fuzz targets runs for 600 s, and a ProVerif model must prove mutual agreement, session-key secrecy, login-code secrecy and rotation binding while eight derived variants are checked too: three that leak one secret must still prove, and five that remove a check must fail. Each CI gate was shown to go red by breaking it on purpose before it was trusted.

Measured, not estimated: 0.45 ms median hybrid handshake in process on an Apple M4 Pro against a 15 ms target, 0.78 to 1.02 ms on GitHub's shared x86_64 runners, and 736 MiB/s record sealing at 64 KiB. The README says plainly that it is not production-ready: trust is manual key pinning with no CA, and the library is single-threaded by design.

### Atlas (`atlas-engine`)

C++23 engine for map-based strategy games with a deterministic lockstep simulation and sandboxed WebAssembly mods.

- 2026 · in progress · featured · tags: swe · resumes: swe
- https://github.com/happyc0der/atlas-engine
- stack: C++23, SDL_GPU, HLSL, WebAssembly, ENet, CMake, vcpkg, Catch2
- stats: 1,000+ tests · 1M-cell tick in 694 us · 32 milestones, 25 ADRs
- Solo C++23 engine for map-based strategy games, built in 32 gated milestones: SDL_GPU renderer, asset pipeline with hot reload, versioned scene serialization, audio, animation, and 25 architecture decision records.
- Deterministic fixed-tick simulation with canonical state hashing, replay, save and load, and lockstep play over ENet sockets proved hash for hash between two processes; a million-cell tick runs in 694 us on four workers.
- Mods run as untrusted WebAssembly with no clock, filesystem or random generator of their own; over 1,000 tests, and CI on macOS, Linux and Windows with ASan and TSan lanes, clang-tidy and a software-GPU lane; a local compare script fails benchmarks more than 1.25x slower than a recorded baseline.

Atlas is an engine, not a game: it has no countries, wars, diplomacy or rules, and is not meant to. I built it alone in gated milestones, M0 through M31, each ending with a clean configure, build, test run and a runnable demonstration. Every decision that is expensive to reverse is an ADR, 25 so far, and recent milestones each end with a report of what changed, what was run and what is still risky.

The simulation advances in whole integer ticks and hashes its state, so a replay, a save or a second process in lockstep can be checked bit for bit. Lockstep runs over the command queue: M14 proved it with several simulations in one process agreeing hash for hash, M17 with two processes over a real ENet socket; a round trip over the loopback interface has a 22.4 us median. A million-cell tick takes 694 us on four workers against 1.650 ms without the pool; what remains is serial, and the hash is 0.38 ms of it. Mods are WebAssembly modules that reach simulation state only by submitting commands, with no clock, no filesystem and no random generator of their own.

Two applications live in the engine. `atlas_sandbox` demonstrates the lifecycle and scene layer. `atlas_lab` is a synthetic million-cell grid with map modes, picking, time controls and replay, there to test the architecture rather than to be a game. The first game is chess, written inside the engine's tree from M18 to M26 as a probe: every rule including the draws, perft-verified, with the Opera Game as a golden hash, playable by two people at one screen or over a socket, and since M26 against an opponent that is a C mod compiled to WebAssembly. M27 made the engine installable as a package and moved chess to its own repository, [atlas-chess](https://github.com/happyc0der/atlas-chess), built against the installed engine and nothing else. That is the charter's test for v1.0: a game links the engine and runs a deterministic simulation without patching engine internals.

Not done: the renderer is verified on an Apple M4 Pro through Metal, an NVIDIA RTX 3080 Ti on Windows through Vulkan and a software rasterizer; Direct3D 12, AMD and Intel graphics are unverified. Networking is direct address only, with no encryption, NAT traversal or lobby. No large mod has been written, so what loading a real one costs is unmeasured. Everything deferred is listed with its reason in `docs/DEFERRED.md`.

### LFP2Vec audit (`lfp2vec-audit`)

Reproduction of LFP2Vec (NeurIPS 2025) on public Neuropixels data, a preprocessing fix for its cross-lab failure, and two measurements the paper does not make.

- 2026 · featured · tags: ml data · resumes: ml
- https://github.com/happyc0der/lfp2vec-audit
- stack: Python, PyTorch, Hugging Face transformers, wav2vec2, scikit-learn, SciPy, pytest, GitHub Actions
- stats: 0.74 vs 0.68 published · 100 Hz low-pass fix · 337 tests, CI on push
- Reproduced the fine-tuning stage of LFP2Vec (NeurIPS 2025) on public IBL and Allen Neuropixels data on a laptop: 0.74 ± 0.07 balanced accuracy over seven held-out IBL sessions against the paper's 0.68.
- Traced the cross-lab collapse to a preprocessing mismatch, spectra diverging up to 768-fold above 300 Hz, and showed a 100 Hz low-pass with no target-lab labels restores the published margin in one direction (+0.13 ± 0.03 vs +0.12) and most of it in the other (+0.08 ± 0.07 vs +0.11) over three seeds.
- Measured calibration under lab shift, which the paper calls for but does not report (ECE 0.10 in lab, 0.56 across labs, 0.35 after the fix), added an electrode-position control, and backed it with 337 tests, a leakage check before every training run and a synthetic smoke gate in CI.

LFP2Vec (He et al., NeurIPS 2025) fine-tunes the audio model wav2vec2 on raw local field potential to say which brain region an electrode sits in, from three seconds of one channel. No pretrained weights were released, so I re-ran the fine-tuning stage on the two public datasets the paper uses, IBL and Allen Neuropixels, on an M4 Pro laptop. Within a lab it reproduces: 0.74 ± 0.07 balanced accuracy over all seven held-out IBL sessions against the paper's 0.68, and 0.81 with the paper's post-processing.

Trained on one lab and tested on the other, the model lands below the majority-class rate on every one of three seeds, predicting one class for 94% of the other lab's chunks at a mean confidence of 0.98. The cause is preprocessing, not the representation. The IBL pipeline band-passes at 0.5 to 300 Hz and the Allen release does not, so the mean spectra diverge up to 768-fold above 300 Hz and a linear probe recovers the source lab from the embeddings at AUC 0.997. Low-passing every input at 100 Hz, a corner I chose from the spectra before any cross-lab result existed, takes the post-processed margin to +0.13 ± 0.03 from Allen to IBL (published +0.12) and +0.08 ± 0.07 from IBL to Allen (published +0.11). An untrained audio checkpoint with a linear head on the same inputs does as well, in one eight-minute forward pass instead of two and a half hours per fine-tune.

The paper's Broader Impact section asks for calibrated uncertainty and reports none. Expected calibration error is 0.10 in lab and 0.56 across labs; a temperature fitted in lab barely moves the cross-lab number, and the target lab needed a temperature four to seven times larger. Matching the filters halves the error to 0.35. Electrode depth alone reaches 0.77 within IBL, where insertions are stereotyped, and chance across labs; fused with the signal as a product of experts the pair reaches 0.78 on IBL and 0.72 on Allen, at or above both parts.

Every training run passes a synthetic smoke test, a leakage check on its split and a throughput gate before it starts, and writes a manifest with the git commit, data hashes and seed before its first step. Of the 337 tests, the 320 that need no real data run in CI with an end-to-end smoke run on every push to main, and every table and figure regenerates from saved results. On 21 September 2026 I found that my electrode-position baseline had leaked test labels, retracted the claims that depended on it in a Corrections section of the README, and regenerated every table and figure. Much of the code was written with Claude Code, and the development notes list what I checked by hand.

### EEG dementia re-evaluation (`eeg-dementia`)

Honest, subject-level re-evaluation of a course project that classified Alzheimer's, frontotemporal dementia and healthy controls from EEG: about 60% balanced accuracy, and no deep model beats spectral features.

- 2026 · team of 4 · featured · tags: ml data · resumes: ml
- https://github.com/happyc0der/eeg-dementia-graph-transformer
- credit: The Spring 2025 project was a team of four in NYU's Neuroinformatics course: Subhrajit Dey (subro608 on GitHub), who wrote most of the original graph-transformer model and training code, Sirish Visweswar, terka2610 and me. It is kept unchanged in the repository's legacy folder. The 2026 re-evaluation is mine: the subject-level evaluation harness, the 16 feature pipelines, the foundation-model and CNN comparisons, the statistics and the tests.
- stack: Python, PyTorch, braindecode, MNE, scikit-learn, LightGBM, pyRiemann, uv, pytest
- stats: 88 subjects, 10x5-fold nested CV · 61.1% vs 33% chance · no deep model beats features
- Re-evaluated a course project that reported 63.6% accuracy for Alzheimer's (AD), frontotemporal dementia (FTD) and controls from resting EEG after model selection leaked subjects (99% validation accuracy): every split is now over subjects, with nested model selection, 10 repeats of 5-fold CV, bootstrap CIs and permutation tests.
- Compared 16 feature pipelines with EEG foundation models (LaBraM, CBraMod, BIOT) and CNNs under one protocol, pre-registered for the deep models: the best pre-specified model reaches 61.1 ± 3.0% subject-level balanced accuracy (chance 33%), and no deep model beats it; AD vs controls reaches 84.6%, AD vs FTD stays near 60%.
- Found that 92% of every channel's variance in the distributed recordings is one common-mode artifact, which the average reference removes; leakage tests with spy estimators, and a test that fails if the README tables and the result files disagree.

The project started in Spring 2025 in NYU's Neuroinformatics course: a graph transformer that classified Alzheimer's disease (AD), frontotemporal dementia (FTD) and cognitively normal controls from resting-state EEG on the public OpenNeuro ds004504 dataset (88 subjects, 19 channels). It reported 63.6% accuracy on one 18-subject test split, after model selection on 15-second chunks that put chunks of the same recording in both training and validation, which is why validation accuracy was 99%.

In 2026 I re-evaluated the task properly. Every split is made over subjects, hyper-parameters are chosen by an inner cross-validation on the training subjects only, and every model runs through 10 repeats of 5-fold cross-validation with subject-level metrics, class-stratified bootstrap confidence intervals and permutation tests of the whole nested pipeline. Honest three-class performance is about 60% subject-level balanced accuracy against 33% chance. The best pre-specified model, a soft vote of a spectral logistic regression, a Riemannian model and LightGBM, reaches 61.1 ± 3.0% [53.6, 68.0].

The second phase, written down before any outer-fold run, compared that with EEG foundation models (frozen and fine-tuned CBraMod, frozen LaBraM and BIOT) and CNNs trained from scratch (EEGNet, ShallowFBCSPNet). None beats the feature models: frozen LaBraM with a linear head reaches 61.3%, ShallowFBCSPNet 60.3%, and three deep models are significantly worse. With about 70 training subjects per fold the networks memorise subjects within a few epochs, and what the classifiers use is the EEG slowing of dementia that band power already captures. AD vs controls works (84.6% leave-one-subject-out, in line with rigorous studies), FTD vs controls reaches 78.8%, but AD vs FTD stays near 60% with every representation tried.

Along the way I found that about 92% of every channel's variance in the recordings as distributed is one common-mode signal, mostly below 2 Hz and identical across groups; the original pipeline z-scored it into most of its input, and the average reference removes it. Spy estimators in the tests check that no fit call ever sees a test subject, and a test fails if any README table disagrees with the result files. The limitations are in the README: one site, 23 FTD patients, and deep models run at pre-registered defaults rather than tuned.

### doom-ports (`doom-ports`)

DOOMCE and TRENCHFIRE: one from-scratch raycaster for a TI-84 Plus CE calculator and a Garmin Venu X1 watch.

- 2026 · featured · tags: swe · resumes: swe
- https://github.com/happyc0der/doom-ports
- live: https://apps.garmin.com/apps/f81aaa08-71a6-4bc2-8faa-716f37a8ad44
- stack: C, eZ80 assembly, Monkey C, Connect IQ SDK, CEdev, SDL2, libmtp, Python
- stats: 24 KB, 5-7 fps on eZ80 · 1-2 fps to 15.6 fps · on the Connect IQ store
- From-scratch first-person raycaster for the TI-84 Plus CE in C and eZ80 assembly, about 24 KB at 5 to 7 fps: textured walls, variable floor and ceiling heights, sliding doors, state-machine enemies, dodgeable projectiles, all art generated at startup.
- Measured that one VRAM byte write costs about 122 eZ80 cycles, fit a frame-time model to it (ceiling about 6.2 fps for a full 320 by 200 view), and moved the column fill to hand-written assembly.
- Ported it to the Garmin Venu X1 in Monkey C, micro-benchmarked the watch (about 0.2 ms per bitmap draw whatever its size) and rebuilt the renderer around call count: 1 to 2 fps to 20 fps still and 15.6 fps moving; on the Connect IQ store.

The engine is original. Textured walls, floors and ceilings at different heights, sliding doors, soldiers with a state-machine AI, projectiles you can sidestep, pickups and a status bar. Every texture and sprite is generated at startup by code in the repository, so there are no game assets to ship. It shares a genre and a pun with a well-known shooter and nothing else, which is why the watch version carries a different name.

On the calculator the limit is painted area, not instruction count. I measured one byte written to VRAM at about 122 cycles, which puts a hard ceiling of about 6.2 fps on a full 320 by 200 view, and on the eZ80 a multiply, a shift, or an AND, OR or XOR on a 24-bit int compiles to a function call. So the work was Bresenham stepping instead of fixed point, pointer walks instead of 2D indexing, lookup tables instead of multiplies, and an assembly loop for the column fill. A host build compiles the same `main.c` against stub headers, so the renderer can be profiled and played under SDL2 on a laptop.

The watch has the opposite shape. Its own micro-benchmarks showed that a bitmap draw costs about 0.2 ms whatever its size, a rectangle fill about 0.12 ms, bitmap draws are hardware-scaled, and one interpreted loop iteration is about 24 µs, so the renderer had to minimize calls rather than pixels. Each wall face is one `drawScaledBitmap` of a 1 by 32 texture column, sprites are prebuilt palette bitmaps shaded with `setPalette`, adjacent floor fills are merged, the wall pass is cached offscreen once the view holds still, and the game logic runs while the GPU is still drawing the walls. Startup is split into about 140 small tasks so the watchdog does not kill it.

The Venu X1 is MTP-only over USB and macOS has no MTP support, so I wrote a small libmtp pusher and a script that pulls the on-device profile log. The port requests no permissions, makes no network calls and is free. GPL-3.0-or-later.

### TideFit (`tidefit`)

Security audit, Next 14 to 16 upgrade and production launch of a roommate's Next.js trip planner.

- 2026 · featured · tags: sec swe · resumes: swe sec
- https://github.com/UtkarshMitta/tide-fit
- live: https://tide-fit.vercel.app
- credit: The app is Utkarsh Mittal's (UtkarshMitta on GitHub). The audit, the upgrade, the tests, the CI and the launch are mine.
- stack: TypeScript, Next.js 16, React 19, Supabase, Vercel, GitHub Actions, node:test
- stats: 15 findings, 13 fixed · npm audit 6 to 0 · 0 to 45 tests
- Security and correctness audit of a Next.js trip planner: 15 findings confirmed against the running app (OAuth CSRF, a Supabase policy exposing every user's trips, an app secret in a plaintext cookie, no rate limit on paid endpoints), 13 fixed and 2 documented.
- Upgraded Next 14 to 16 and React 18 to 19 by hand (async cookies, middleware to proxy, ESLint 9 flat config), taking npm audit from 6 vulnerabilities to 0 and tests from 0 to 45, with CI that deploys main to Vercel once the checks pass.
- Launched it at tide-fit.vercel.app with private Blob storage so shared links survive redeploys, an edge rate limit verified at 20 requests then 429, and Strava and Google Calendar sign-in verified end to end on the live site.

TideFit is my roommate Utkarsh Mittal's Next.js trip planner for athletes. It fetches sport-specific forecasts (sea state for swimmers, air quality for runners, wind and heat for cyclists and hikers), grades each trip day safe, caution or unsafe against tunable thresholds, and writes a day-by-day plan. The app is his and he gave me full permission to change it. The audit, the upgrade, the tests, the CI and the launch are mine.

I read all 45 source files and probed a local server that had no API keys. The high-severity findings: the Strava and Google OAuth callbacks accepted any authorization code, a Supabase policy let anyone holding the public anon key read every user's trips, a visitor's Strava app secret was stored in a browser cookie in plaintext, and the endpoints that spend money had no rate limit. Each of those fixes was verified: a forged callback is rejected, the anon key reads no rows, the cookie holds ciphertext, and the 11th request in a minute gets a 429 from the app's own per-IP limiter, behind a Vercel firewall rule that allows 20 a minute. The worst bug for users turned up after the audit: the server's UTC date survived hydration as the date input's minimum, so the trip form would not submit every evening in the Americas.

The Next 14 to 16 upgrade was a proper migration rather than the codemod's escape hatch: async cookies(), middleware to proxy, ESLint 9 flat config. npm audit went from 6 vulnerabilities (1 critical, 5 high) to 0 and the test suite from 0 to 45. CI runs typecheck, lint, tests and a zero-key build, then deploys main to Vercel. The work went in as 16 merged pull requests. Two low-severity findings are written up in docs/AUDIT.md rather than fixed.

### ForgeLog (`forgelog`)

Offline Android gym tracker with no accounts and no network permission.

- 2026 · featured · tags: swe · resumes: swe
- https://github.com/happyc0der/ForgeLog
- live: https://happyc0der.github.io/ForgeLog/
- stack: Kotlin, Jetpack Compose, Room, Hilt, DataStore, kotlinx.serialization, Robolectric
- stats: 830 tests · 2.3 MB signed APK · no INTERNET permission
- Offline Android gym tracker in Kotlin with Jetpack Compose, Room, Hilt and MVVM; the manifest declares five permissions and no INTERNET permission.
- Rest timer counts down on the lock screen and survives process death; analytics for volume, estimated 1RM and personal bests; JSON backup, restore and CSV export through the Storage Access Framework.
- 830 tests run on the JVM with no device, plus 38 instrumented tests on API 26 and API 36 emulators; released as a signed 2.3 MB APK (v1.0).

I built ForgeLog to plan gym programs, log sets during a workout and compare sessions over time, with every workout kept on the phone. There is no account, no backend and no INTERNET permission, so training data leaves the phone only when the user exports it. The rest countdown shows in the workout notification on the lock screen, comes back paused, skipped or extended if Android kills the app, and holds a wake lock so it reaches zero with the screen off.

Backup is a JSON file and export is CSV, both through the Storage Access Framework, so the app holds no storage permission. A restore is validated in full before anything is written, and the release checks record about 1,500 deliberately corrupted files that the importer refused instead of crashing on. Room schema JSONs are committed and there is no destructive-migration fallback, so a missing migration fails loudly rather than wiping history.

830 tests run on a laptop with no device attached: Room and the Compose screens run under Robolectric, and 38 instrumented tests run on Gradle managed emulators at API 26 and API 36, the same UI tests on a real Android runtime plus the few that need a device. v1.0 is a signed 2.3 MB APK on GitHub Releases, one file for all four CPU architectures, Android 8.0 and up, GPL-3.0-or-later. It is my first Android app. The Play Store listing text is drafted but not submitted.

### Custodian (`custodian`)

Household inventory that watches CPSC, NHTSA and openFDA recalls, served as an MCP server with its own OAuth 2.1 server for Alexa+ and Claude.

- 2026 · featured · tags: swe sec · resumes: sec
- https://github.com/happyc0der/custodian
- stack: TypeScript, MCP, OAuth 2.1, Express, Preact, AWS CDK, DynamoDB, Bedrock
- stats: 10 MCP tools · 79 tests · p95 under 100 ms
- Self-hosted MCP server plus MCP App that checks a household inventory against the CPSC, NHTSA and openFDA recall feeds and tracks home maintenance: 10 tools, 5 screen views, and a deterministic matcher that writes a reason for every match; built for the Alexa+ track of Amazon Build, Ship, Shape 2026; not submitted.
- Wrote the two-tier OAuth 2.1 authorization server by hand to fit the Alexa+ account-linking shape: client_credentials for service calls, authorization_code with PKCE S256 for household calls, ES256 JWTs, single-use codes, rotating 180-day refresh tokens and scope gating per JSON-RPC method, all covered end to end by tests.
- Kept tool calls inside the 500 ms Alexa+ voice budget by moving all network and model calls into an hourly sweeper (local tests assert p95 under 100 ms through the real HTTP stack), in a TypeScript monorepo with file and single-table DynamoDB stores under one contract suite, 79 vitest tests on recorded feed fixtures, and a CDK stack synthesized in CI.

You tell it what you own, a car seat, the minivan, the smoke detectors. It keeps checking the public CPSC, NHTSA and openFDA recall feeds, tracks the small things that keep a home safe (smoke-detector batteries, filters, car-seat expiry, vehicle service, warranties), and answers in one or two spoken sentences with the remedy included. It runs as a self-hosted MCP server over Streamable HTTP, so any MCP host can call it, such as Claude or a script. It was designed for an Echo Show running Alexa+ but never deployed to one. It ships a Preact MCP App that draws recall cards, a recall detail page, the household briefing, the maintenance timeline and the inventory when the host has a screen.

Matching is deterministic and every match carries a written reason. Candidates come from a MiniSearch index over titles, products and keywords; brand, model and distinctive-word overlap are weighted, a score of 0.5 records a match and 0.8 is spoken as definite. Keywords come from the record body rather than the title, because the CPSC feed has a record whose title belongs to a different recall, which the tests now pin with a recorded fixture. When Claude on Bedrock is enabled it adjudicates only the 0.5 to 0.8 band, and the verdict is cached on the match so it is never re-asked.

Alexa+ allows 500 ms per tool call, so no tool handler does network I/O or calls a model. All of that runs in a sweeper, hourly and right after add_item returns. The OAuth 2.1 authorization server is my own because voice assistants need a two-tier shape (client credentials for service calls, PKCE for household calls, no dynamic client registration, no WWW-Authenticate challenge) that generic MCP auth libraries do not produce.

I built it in September 2026 (the commits run from 2026-09-11 to 2026-09-23, plus a license commit on 2026-10-18) for the Alexa+ track of Amazon Build, Ship, Shape 2026. The add-on itself was not submitted: the Alexa CLI is distributed through a private AWS CodeArtifact repository that needs an AWS account, which I do not have, so the repo stands as a portfolio piece. What I learned about the toolkit and the feeds is in docs/platform-notes.md. The screenshots were rendered with the reference MCP Apps basic-host against live recall data.

### Gemma 4 SWE agent (`gemma-swe-agent`)

Solo Kaggle SWE-agent entry: my own Google ADK agent, a harness re-implementation written before the organizers released theirs, and a faithful offline eval.

- 2026 · in progress · featured · tags: ml swe · resumes: ml
- https://github.com/happyc0der/gemma-swe-agent
- credit: Since 2026-10-21 the daily base is a public bundle, Budget-Fit, by Kaggle user verracodeguacas (Apache 2.0). The swelite harness, the offline eval and prompts through v6.0 are mine.
- stack: Python, Google ADK, vLLM, llama.cpp, LiteLLM, Docker, Gemma 4, Tailscale, Kaggle API
- stats: 109/129 gold checks · own agent best public score 0.12 · $0 cloud spend
- Kaggle Gemma 4 Developer Agent competition (solo; ends 2026-12-02, final ranking pending): a Google ADK agent that fixes GitHub issues with Gemma 4 31B, scoring 0.00 on the first two days, then 0.06 to 0.12 over 20 scored submissions through 2026-10-20 (best 0.12, 7 of 58 public tasks, first on 2026-10-10). Since 2026-10-21 the daily base is a public bundle, Budget-Fit (Apache 2.0, by Kaggle user verracodeguacas); its best, 0.18 on 2026-10-26, is the bundle's, not my agent's.
- swelite, a re-implementation of the organizers' evaluation harness written before they released theirs on 2026-09-25 (Docker sandboxes, the 9 fixed tools, ADK YAML compiler with skills, multi-pass patch verification, failure-taxonomy analyzer), validated with gold and null checks on all 129 public tasks: 109 pass, 0 pass unfixed.
- Faithful offline eval at $0: the organizers' harness patched so its sandbox behaves like the scorer's (gold 33/33, no patch 0/33), the real 31B via llama.cpp on Kaggle T4x2, a 33-task holdout; prompt v5.8 solved 14/33 vs 13/33 for v5.0n, a gap inside run-to-run noise. An earlier 12B proxy on a 16 GB laptop GPU showed that ADK never compacts context inside a task and that temperature 0.7 cut identical retries from 13.5 to 5.1 per task.

The competition asks for a declarative Google ADK agent config (YAML, prompts, skills, optional LoRA adapters) that turns `gemma-4-31b-it-qat-w4a16-ct` into an agent that fixes real GitHub issues offline. Scoring runs on about 120 hidden tasks from private repos on 4x L4 GPUs, with 12 hours for the whole set and one submission a day. I entered solo with a $0 cloud budget, Kaggle's free GPU hours only.

The organizers' evaluator was unreleased when I started, so I re-implemented it from their spec as `swelite`: Docker and subprocess sandboxes, the 9 tools with the same JSON contracts and truncation caps, a sandboxed YAML compiler with include directives and ADK skills, the nudge loop, multi-pass patch verification and an analyzer that sorts failures into buckets. Gold and null checks on all 129 public tasks give 109 pass and 0 pass unfixed (2 on the native x86_64 box); the 20 residual gold failures are environment differences, listed per repo in `docs/harness-fidelity.md`. The organizers released theirs on 2026-09-25; config checks have run on the official code since 2026-09-26, and that document lists the differences between the two.

The 31B model's roughly 17 GB of weights do not fit my laptop's 16 GB GPU, so that laptop served Gemma 4 12B through vLLM 0.30 as a proxy. I set it up over SSH and Tailscale: WSL2, Docker, vLLM fitted into 16 GB, and Task Scheduler for jobs that survive SSH logoff. Runs are logged under `experiments/` with a config snapshot, per-task results and notes.

Two findings drove the prompt. ADK's context compaction never fires inside a task, so trajectories die at the 32k window after about 20 full-size tool outputs. Temperature 0.2 makes the model retry failed calls verbatim; 0.7 cut identical repeats from 13.5 to 5.1 per task. The proxy holdout went from 6/33 to 7/33 with a prompt written around a context budget.

My first runs of the real 31B on Kaggle's T4s could not judge prompts: thinking was effectively on and FastAPI tasks ran against the wrong Pydantic. So on 2026-10-03 I patched the organizers' own harness so its sandbox behaves like the scorer's, a clean Python 3.13 venv built from the competition wheels. On the 33-task holdout, gold patches pass 33/33 and no patch passes 0/33. The real 31B then runs through the official Evaluator, served by llama.cpp (Q4_0) on Kaggle's free T4x2, with thinking off and time budgets scaled by 3 for T4 speed. Prompt v5.8 solved 14/33 against 13/33 for v5.0n, the first result above that baseline, and v6.0 tied it at 14/33. A one-task gap is inside the noise: an identical rerun of one config moved from 9/33 to 12/33.

The first two daily submissions scored 0.00 on the public leaderboard, and the cause was never pinned down. From 2026-09-27 my configs scored between 0.06 and 0.12 over 20 scored submissions through 2026-10-20. My own agent's best is 0.12, 7 of the 58 public tasks, first reached on 2026-10-10 with prompt v5.0n and reached again with v5.8 on 2026-10-20.

Since 2026-10-21 the daily base is not my agent. It is a public bundle, Budget-Fit (Apache 2.0, by Kaggle user verracodeguacas, credited in `experiments/variants/pub-budget-fit.CREDIT.md`), which I switched to because public runs of its files solved 8 to 11 of 58 tasks against about 6 for my configs. Its best public score is 0.18 (11/58), first on 2026-10-26, and its seven scored runs average 9.71 of 58. Those are the bundle's scores, not my agent's. A candidate that added one bullet of mine to the base scored 8 and 7 of 58, below the base's mean, so I dropped it. The offline eval cannot judge the bundle as it runs: T4 speed forces thinking off and the bundle runs with thinking on. With thinking off it solved 9/33, and 12/33 on a rerun, below v5.8's 14/33, which is the reverse of the leaderboard order.

A paper-track write-up is in draft, due 2026-11-12. The competition closes 2026-12-02; final ranking pending.

### Biohub cell tracking (`biohub-cell-tracking`)

Kaggle cell-tracking competition entry on free GPU, final rank 591 of 3,947 teams (top 15%), built on an offline post-processing harness and a 3D CNN that prunes false cell divisions.

- 2026 · Finished · tags: ml data · resumes: ml data
- credit: The submission is a fork of Igor Zharov's public Harmonic Fusion notebook (Apache-2.0). The offline harness, the division classifiers and every experiment are mine.
- stack: Python, PyTorch, NumPy, SciPy, polars, scikit-learn, uv, Kaggle API
- stats: 591st of 3,947 (top 15%) · +0.005 measured twice · ~22 Kaggle GPU-hours
- Kaggle Biohub Cell Tracking During Development (September 2026): public leaderboard 0.952 against 0.947 for the unmodified public notebook it builds on, using only free Kaggle GPU; final rank 591 of 3,947 teams (top 15%), private leaderboard 0.918.
- Built an offline harness that runs GPU inference on Kaggle once, then re-runs the notebook's post-processor locally against the hosts' official scorer on 40 held-out videos, five times the upstream validator, and matches the notebook's own score to +0.00011.
- Trained a small 3D CNN on 134 annotated cell divisions to prune false division forks: predicted +0.0047 on a pre-registered holdout, measured +0.005 on the leaderboard twice, while nine other ideas were tried and rejected.

This is a code competition with a 12-hour notebook cap, and I had only the free Kaggle GPU quota. The strongest public notebook, Harmonic Fusion, scores 0.947 and tunes its post-processing inside the notebook on 8 videos with 7 candidate configurations, because inference eats the budget. Inference needs the GPU; post-processing does not. I forked the notebook, ran inference once over 40 held-out training videos, exported the raw prediction graphs and ground truth, and pulled the post-processor out of the notebook with an AST extractor so it runs on my laptop against the hosts' official scorer. Before trusting anything downstream I checked the port against the notebook's own output: score delta +0.00011, median node shift 0.0000 µm against a 7 µm matching tolerance.

Every offline number is a selection set of 26 videos against a holdout of 14, balanced by embryo and split before any experiment. Most ideas died there. A 358-evaluation coordinate descent over 20 post-processing knobs gained +0.016 on the selection set and lost 0.010 on the holdout. Turning off the DeepCenter veto, loosening the division gates, and rewiring daughters to a different parent on geometric rules all failed too: in 29 of 60 annotated divisions the true parent sits about five times farther from its daughter than a competing node, so no local rule recovers them. One flag that gained +0.0045 on the holdout lost 0.002 on the leaderboard; a holdout with 17 division events cannot separate +0.004 from zero, and the log says so.

The one change that survived is a small 3D CNN, trained on 134 real cell divisions, that scores every node and prunes division forks it judges false. On the holdout it cut division false positives from 6 to 3 without losing a true positive, gave the identical result at every threshold from 0.10 to 0.30, and cleared a random-score floor I had measured first. It predicted +0.0047; the leaderboard gave +0.005 twice, 0.945 to 0.950 and 0.947 to 0.952. The shipped version averages two such classifiers. The whole result cost about 22 of a 30-hour weekly GPU quota, each run logged with its cost.

The competition closed on 2026-09-29. The entry finished 591st of 3,947 teams (top 15%). Its private leaderboard score was 0.918, against 0.952 on the public leaderboard; the private set is a different group of test videos. The code is private for now, under GPL-3.0, with the full experiment log, the GPU ledger and a step-by-step reproduction in the repository.

### TrafficFlowBench (`trafficflowbench`)

Solo Kaggle freeway traffic benchmark entry (team Dank Axon), public leaderboard 0.892 against a 0.553 baseline, final ranking pending.

- 2026 · in progress · tags: ml data · resumes: data
- https://github.com/happyc0der/trafficflowbench
- stack: Python, PyTorch, LightGBM, scikit-learn, NumPy, SciPy, polars, pandas, Kaggle API
- stats: public LB 0.892 · onset IoU 0.57 to 0.93 · 6.8 and 7.2 h local byte-for-byte repro
- Kaggle TrafficFlowBench (2026 IEEE Big Data Cup), solo as team Dank Axon: public leaderboard 0.892 (0.89171 for the final pair, sub63 and sub64) against the organizers' 0.553 baseline, up from 0.674 on my first submission; final ranking pending.
- Four-task pipeline: state from a same-link interpolation plus neighbor ridge baseline corrected by four LightGBM residual models and four 2-D U-Nets of my own in PyTorch (two seeds and two further train re-masks, each fine-tuned on self-masks of both scored months, 0.8 of the blend); LightGBM queue forecasters on causal features, with onset sets chosen within ±12 links of the most likely cell; and a regularized non-negative least-squares origin-destination solve on each split's own link counts.
- Found a window-selection regularity in the queue-onset task that lifted onset IoU from 0.57 to 0.93 and reported it on the competition forum; the hosts confirmed it and announced it to all teams. Both final submissions rebuild byte for byte from a fresh clone of my local repository (6.8 h and 7.2 h), and the causality check passes 304 of 304 comparisons; that final code is not public yet.

TrafficFlowBench is the 2026 IEEE Big Data Cup competition on Kaggle: ten freeway corridors at five-minute resolution and four scored tasks on the same data. Fill the missing detector cells, say which links are queued over the next thirty minutes, keep the reconstruction consistent with traffic-flow physics, and estimate origin-destination (OD) path flows from link counts. The score weights them 0.35, 0.30, 0.15 and 0.20. The public leaderboard scores one month and a separately generated month decides the final ranking. I entered solo as team Dank Axon. Final submissions are due Nov 6, the competition ends Nov 7, 2026, and code and report are due Nov 10, so the final ranking is pending.

The public score is 0.892 (0.89171 for the final pair, sub63 and sub64), against the organizers' 0.553 baseline and 0.674 for my first submission, which used same-link time interpolation plus the organizers' baselines for queues and OD demand. State and physics now contribute 0.443 of their 0.50, queues score 0.834 and OD scores 0.994.

Most of the gain came from the queue task, and the main lesson was what not to trust. Inside the training split the queue models scored about 0.92 while the leaderboard gave 0.775. The nine train months are one simulated world: their congestion maps correlate 0.98 with each other and 0.85 with the scored months, so checks inside train overstated the queue score by about 0.14. On an organizer-emulating proxy, an all-feature ongoing model trained out of core on 48M rows scored below the same model on 8,000 windows (0.795 vs 0.828), and dropping the train-world frequency map lifted the proxy further (0.828 to 0.868). The ongoing model I kept has no map and trains on 8,000 uniform plus 8,000 selection-matched windows; the selection-matched half barely moved the proxy and added 0.0044 on the leaderboard. The real windows' horizons are blanked in the release, so the proxy can never contain one, and for new kinds of queue model only the leaderboard was a fair test.

Checking the shipped queue-onset train windows, I found that in 39 of 40 the first queued cell appears exactly at T+30, a side effect of how the organizers pick window origins. A model trained only on windows built the same way lifted onset IoU from 0.57 to 0.93 on held-out dates. I wrote it up on the competition forum, said plainly that my submission already used it, and offered to switch back. The hosts confirmed the regularity, said it could be used, and announced it to every team. The last queue gain came from set selection: a new queue forms at one bottleneck, so choosing onset sets within ±12 links of the most likely cell added 0.030 onset IoU out of fold and moved the leaderboard from 0.89113 (sub54 and sub55) to 0.89171.

The state task added 0.024. On top of a same-link interpolation plus neighbor ridge baseline it blends four LightGBM residual models (A to D) with four small 2-D U-Nets of my own in PyTorch (three levels, 0.85M parameters) that see a corridor's whole masked day: two seeds and two further train re-masks, each fine-tuned on self-masks of both scored months. The U-Nets take 0.8 of the weight and the trees 0.2, separately for speed and for density. Once fine-tuning started I judged each step on held-out self-masks of the scored month, where the leaderboard returned 52 to 71% of the U-Net estimates, against 25 to 77% for held-out train days.

For the OD task I solve on each split's own link counts rather than the train counts the organizer script used. The released counts are noise-free and an unregularized non-negative solve fits them to 0.9999; the final solve adds an L2 pull to the split's prior.

The rules require winners to reproduce their file from code within 1% of the private score. `reproduce.sh` rebuilds everything from the released data, and both final submissions came back byte for byte from a fresh clone of my local repository (6.8 h and 7.2 h on my Mac, all four U-Nets retrained). The hosts will also rerun the code with every row stamped after each window's origin removed; `causality_check.py` does that deletion at all 152 validation and private origins, and queue-task inputs stay identical in 304 of 304 comparisons. In a separate control, a planted two-hour leak was flagged on 8 of 8 sampled cuts. The two final files differ only in 131 private-month ongoing rows, a hedge on whether training on the public month helps private-month forecasts, which the public leaderboard cannot test. Rejected probes, including OD deviation forms and queue models without train-world inputs, are logged in NOTES.md.

The linked repo is still at its September 25 state (public score 0.845). The final code, including this `reproduce.sh` and `causality_check.py`, the report and the later NOTES.md entries are not public yet.

### Kaggle S6E9, EV purchases (`kaggle-s6e9`)

Kaggle Playground S6E9, final rank 287 of 3,575 teams (top 9%), with a 192-experiment ledger and a label-noise ceiling analysis.

- 2026 · tags: ml data · resumes: ml data quant
- https://github.com/happyc0der/kaggle-s6e9-ev-purchases
- stack: Python, LightGBM, XGBoost, CatBoost, PyTorch, scikit-learn, SciPy, Kaggle API
- stats: 287th of 3,575 (top 9%) · 192 experiments · 669k rows
- Kaggle Playground S6E9 (EV purchases, ROC AUC): out-of-fold AUC 0.94648, public leaderboard 0.94649 (hedge entry) and 0.94642 (best validated entry) against a leader at 0.94674; final rank 287 of 3,575 teams (top 9%), private AUC 0.94545 against a winning 0.94602.
- Nested target encodings over the synthetic generator's artifacts on 668,665 rows, 20 folds with encoding-seed bags, and a logit blend of LightGBM, CatBoost and a 15-seed MLP with hard-edge post-processing.
- Logged 192 experiments judged by paired DeLong tests (accept at +0.00008 with z ≥ 3, noise floor about 0.00003), and showed by label resampling that a perfect model would score 0.9459 ± 0.0003, so the remaining gap is label noise.

Kaggle Playground Series S6E9 asks for the probability that a person buys an electric vehicle, scored by ROC AUC. The train set (668,665 rows) and test set (286,571 rows) are synthetic, generated from a 10,000-row original that is itself synthetic: features drawn from a fixed random state, label from a probit formula on income, environmental concern, subsidy and range anxiety. Nearly every point of AUC above about 0.942 comes from the generator's artifacts. A few thousand income and commute values are heavily over-produced, and the label rate at those values departs from the formula. So I modeled how the data was made rather than what it represents.

LightGBM on the 13 raw columns scores 0.9419 out of fold. Per-value frequency, lift against the original and novelty features take it to 0.9436, nested target encodings of income and commute at several bin widths to 0.9459, shallow column-subsampled trees with target encodings on every column to 0.9462, and 20 folds with encoding-seed bags and a logit blend of LightGBM, CatBoost and a 15-seed MLP to 0.9464. XGBoost was trained alongside and got zero weight. The last 0.0001 came from hill-climbing blend weights over out-of-fold prediction libraries other competitors had published; they are credited in the repo and not redistributed. The public leaderboard tracked my out-of-fold score within about 0.0001 throughout.

Every idea ran against a fixed reference with a paired DeLong test and went into experiments/results.csv, 192 rows, most of them negative: interaction encodings in every form, similarity to original rows, density windows, digit residues, pseudo-labeling, native categorical handling, deeper or tuned trees, neural-net value embeddings, segment-wise calibration and more, all within ±0.00005 or worse. The accept rule was a paired gain of at least +0.00008 with z ≥ 3, against a noise floor near 0.00003. To see what was left, I resampled labels from the model's own calibrated probabilities: a perfect model scores 0.9459 ± 0.0003 on those, per cell of concern, subsidy and anxiety the real score matches that ceiling within 0.001, and a model trained to predict the blend's errors explains none of them (R² = −0.003). The rest is label noise the generator put there.

The competition closed on 2026-09-30. The entry finished 287th of 3,575 teams (top 9%), with a private AUC of 0.94545 against 0.94602 for the winner. The pipeline is public under GPL-3.0 with a rerun playbook, dataset-fact tests, a leak-freeness test for the encodings and a synthetic end-to-end smoke test.

### Blockwave (`blockwave`)

A falling-block game with no asset files, and an RL agent that learns to play without ever seeing the score.

- 2026 · tags: ml swe · resumes: ml
- https://github.com/happyc0der/blockwave
- stack: Python, NumPy, pygame-ce, PyTorch, PPO, pytest, ruff, uv
- stats: 465 tests · ~300k engine steps/s · 88x88 pixel agent
- Guideline-style falling-block game in Python and NumPy with no image, font or audio file in the repo: SRS rotation with both kick tables, 7-bag, T-spins, a 240 Hz fixed-timestep loop, deterministic replays and a headless engine at about 300k steps per second.
- PPO agent trained on an empowerment reward that never sees score, lines or level, enforced by a static firewall test; the pixel version sees only an 88x88 crop and learns what its keys do from 60,000 blind key-press trials before counting futures through that model.
- 465 tests in about 40 seconds; after two identical 150M-step runs differed by 42%, I withdrew every single-seed comparison from the README and research log and added a compare tool that refuses to print a significance figure for one seed.

The game is written in Python and rendered in NumPy. There is no image, font or audio file in the repository: each frame is painted into arrays, the typeface is a procedural bitmap atlas, and the 20 sound effects and 5 music loops are synthesized from oscillators by `blockwave gen-assets`. The rules are the modern guideline set, with SRS rotation and separate kick tables for the I piece and the rest, 7-bag piece selection, hold, a five-piece preview, extended placement lock delay capped at 15 resets, and the three-corner T-spin rule. The engine imports no pygame and takes its timestep as an argument, so the game loop, a replay and a headless script drive it identically, and it runs at about 300k steps per second, which is what makes the 10,000-action fuzz test cheap.

The second package is an agent that is never told the score. Score, lines and level reach only the evaluator, and a static test fails if any other module reads them. The reward is empowerment: how many distinct futures the agent's key presses can still reach. The board-state version counts those futures with the simulator and reaches 0.163 lines per piece after 150M steps, against 0.393 for a scripted heuristic and 0.0018 for a policy that simply never hard-drops. The pixel version sees only an 88x88 crop of the screen at five decisions per second, so it cannot borrow the simulator: it runs 60,000 trials of blind key-press programs, fits a model of what they do, and counts futures through that model. The shipped 50M-step pixel agent clears 0.094 lines per piece and survives about 50 pieces a game, and both packages come with pretrained checkpoints.

A second seed of the 150M pixel configuration scored 0.0647 where the first scored 0.0991, a spread of 42% of their mean and about 19 times the within-run standard error I had been quoting. That made every single-seed comparison between reward variants and compute budgets uninterpretable, so I withdrew them in place in the research log rather than deleting them, and wrote `blockwave_rl.compare`, which groups runs by configuration and refuses to print a significance figure for a single seed. Resolving the effect I had reported would take about 214 seeds per arm at five hours each, so the question is closed as unanswerable at that cost. What survives is the deliverable: both seeds beat the drift baseline by 36x and 55x.

The 465 tests run in about 40 seconds. They check kick-table transcription in both directions, audit board invariants after 10,000 random actions, check audio for clipping, DC offset and clicks at loop seams, render each visual setting on and off and fail if the frame does not change, and assert that two boards differing only in score give byte-identical observations to the agent. Policies that beat the reward are recorded as strict expected failures rather than hidden.

### gtnh-agent (`gtnh-agent`)

Safety-first agent that plays the Minecraft modpack GregTech: New Horizons on a private server: a local model decides and plans, and code checks every action before it runs and verifies it after.

- 2026 · in progress · tags: ml swe · on no resume
- https://github.com/happyc0der/gtnh-agent
- stack: TypeScript, Node.js, Ollama, qwen3:14b, Zod, SQLite, Vitest
- stats: 7 quests finished on a live server · 23 allowlisted actions · 172 test files
- An agent that plays GregTech: New Horizons (Minecraft 1.7.10) on a private test server the way a person does: it explores, gathers, digs, shelters for the night, eats, crafts and turns in quests, and has finished seven quests so far.
- A local model (qwen3:14b on Ollama) decides at decision points and plans from a route that code calculates; code expands each step into checked actions, enforces the safety policy, executes, and verifies each result against the server's own updates. The models only propose; they never act.
- Only 23 action types exist, each off until switched on and fenced to a play area; unknown or stale state pauses the agent. It joins through its own 1.7.10 Forge client because Mineflayer cannot join the modpack, and its 172 test files never reach the network or a real server.

GregTech: New Horizons is one of the longest Minecraft modpacks, and its quest book is a natural benchmark: the 92 quests of the "Tier 0 - Stone Age" chapter plus 14 it needs from other chapters, counted only as the server records them.

Each cycle observes the world through the agent's own client into a schema-validated game state in which anything unobservable is explicitly unknown. A pure-code safety policy decides whether that state is trustworthy and pauses if it is not. A deterministic router, or the local model at decision points, picks one bounded decision, which becomes exactly one allowlisted action. A single executor validates the action, runs it with a token only it can mint, re-observes, checks a postcondition derived in code, and logs the outcome to SQLite.

The safety defaults are strict: localhost or private addresses only, a 256-block boundary, retreat below 10 health, at most two failures per action per task, digging limited to listed natural blocks and placing limited to listed plain blocks. `halt` stops every action at once. Built from 27 September 2026 and in progress, with seven quests finished so far. The code is released under GPL-3.0-or-later.

### Split/Second PC fixes (`splitsecond`)

Wireless Xbox controllers, Xbox button names and 60 FPS for a 2010 PC racing game, by proxying its DirectInput and patching it in memory.

- 2026 · tags: swe sec · on no resume
- https://github.com/happyc0der/SplitSecond-PadFix
- credit: SplitSecond-HFR is preseznik's native 60 FPS mod; my fork adds support for the community DLC build (the address profile, a loader fix and a large-address-aware tool). PadFix and ButtonNames are mine.
- stack: C++, Win32, DirectInput, XInput, x86 reverse engineering, CMake, Python
- stats: drop-in DirectInput proxy · 22 prompts renamed in memory · 60 FPS on the DLC build
- Found why modern Xbox controllers fail in Split/Second (2010): it reads input only through DirectInput, a Bluetooth pad reports a different HID layout, and it picks default controls by exact product ID, so an Elite Series 2 (045E:0B22) got no bindings at all.
- Wrote PadFix, a drop-in dinput8.dll proxy in C++ that presents any Microsoft pad as a wired Xbox 360 controller and answers the game's reads from XInput; it also renames the game's 22 DirectInput prompt names in memory, pausing the game's threads to re-check and write each match in well under a millisecond.
- Ported a community 60 FPS mod to a second build of the game: mapped every hooked address from runtime memory dumps of the copy-protected exe, checked each patch against the expected original bytes, and held 59.8 to 60.1 FPS in 209 of 223 five-second windows over a 19-minute session.

Split/Second only understands a wired Xbox 360 pad. Connect a current Xbox controller over Bluetooth and the game either reads it wrong or reads it and ignores every press. Three things stack up: the game reads buttons and sticks only through DirectInput (its single XInput import is for rumble), a Bluetooth Xbox controller has a different DirectInput layout from the wired 360 one, and the game hands out default controls by comparing the device's product ID with a hard-coded table, so anything not on it gets no bindings.

[PadFix](https://github.com/happyc0der/SplitSecond-PadFix) is a `dinput8.dll` the game loads from its own folder. It forwards everything to the system DirectInput except Microsoft controllers, which it reports as a wired Xbox 360 pad and whose state it builds from XInput in the exact wired layout, honouring the ranges and dead zones the game sets. A second DLL forwards the game's old `xinput1_3` rumble calls to the modern XInput. The prompts used to read "PRESS Button 1" and "TAP Axis Z Pos TO DRIFT"; PadFix finds the game's English text table once it has loaded and renames the 22 entries in place. Stale copies of that table sit in freed memory that the game can reuse at any moment, so it searches read-only, pauses the game's other threads, checks each match again, writes and resumes. An offline test plants a copy of the table and checks the rename over 100+ runs. [ButtonNames](https://github.com/happyc0der/SplitSecond-ButtonNames) is the same rename done on disk, with a byte-identical restore.

[SplitSecond-HFR](https://github.com/happyc0der/SplitSecond-HFR) is preseznik's mod that runs the game's loop at a real 60 Hz. It only knew the Steam exe, and the community DLC build is a different compile with every address moved and its code encrypted on disk. I mapped the hooked functions, the frame limiter and the AI update from memory dumps of both builds, instruction by instruction, into a per-build profile; every patch is still checked against the original bytes before it is written. That build's loader also dereferences what the hook returns, which crashed in the graphics driver until the hook returned a small holder object. After two long-session crashes ran out of the 2 GB a 32-bit program gets, a script sets the large-address-aware bit so Windows gives it 4 GB.

All three are early and were tested on one PC with one controller. Split-screen with two real pads, rumble, Steam Input and Linux are untested, and whether the 4 GB fix ends every long-session crash isn't proven yet. Each README lists what was tested, what wasn't, and what to send in a bug report. GPL-3.0; no game files are included.

### ephys-mcp (`ephys-mcp`)

MCP server for read-only analysis of spike-level brain-computer-interface recordings.

- 2026 · tags: swe ml · on no resume
- https://github.com/happyc0der/ephys-mcp
- stack: Python, MCP, NumPy, SciPy, pynwb, spikeinterface, Matplotlib, GitHub Actions
- stats: 24 tools, 5 sources · PyPI + MCP Registry · 52 tests, CI
- Python MCP server that lets an LLM analyze intracortical, spike-level brain-computer-interface recordings: 24 read-only tools over synthetic, local NWB, WAV, live Lab Streaming Layer and DANDI Archive sources, released as v0.5.1 on PyPI and the official MCP Registry.
- Covers signal quality, threshold spike detection, firing rates, ridge and Kalman decoders scored on held-out data, trial-aligned PSTHs, geometry-aware spike sorting through spikeinterface, FALCON-style cross-session evaluation and GPFA written from the paper's equations in NumPy and SciPy, with figures returned inline as PNG.
- Reference results on public data: ridge R² 0.50 for hand velocity on MC_Maze_Small, and on FALCON H1 a decoder that scores 0.43 on its own day and 0.07 one week later; 52 tests, 51 of them run with ruff in CI, a token-gated HTTP transport, no bundled third-party data and a CC0 license.

The BCI MCP servers I found target scalp EEG. I built one for the data a high-channel-count implant produces. An LLM opens a session from a local NWB file, a folder of WAV clips, a live Lab Streaming Layer stream, or an NWB file streamed from the DANDI Archive by HTTP range requests, then works through 24 tools that return summaries and figures rather than raw arrays, so results fit in a context window. A synthetic motor-cortex source with ground truth makes the analysis testable offline, and a stub documents what a live implant adapter would need once a vendor publishes an API.

The analysis side covers signal quality, threshold spike detection with precision and recall against ground truth, firing rates, ridge and Kalman decoders, trial-aligned PSTHs, spike sorting through spikeinterface's built-in sorters, GPFA and PCA latent factors, and probe geometry. Decoder hyperparameters are chosen by blocked cross-validation inside the training split. Datasets that record only during trials have their gaps tracked and left out of rates and decoding instead of being read as silence. Sorting uses the probe geometry, so on a simulated 20 µm probe it finds the 12 real units where treating contacts independently reports 15.

On MC_Maze_Small (DANDI 000140, 142 units) ridge decodes hand velocity at R² 0.50 and Kalman at 0.34. On FALCON H1 (DANDI 000954, 176 channels) a ridge decoder trained on the first held-in day scores 0.43 on that day's minival split, 0.07 one week later and below zero on the held-out days, which is the decay the benchmark exists to measure. On the simulator, whose true latent is 2-D cursor velocity, GPFA finds two dominant factors that explain velocity with R² 0.95 against 0.68 for PCA. The decoders are simple causal linear baselines, not state of the art, and FALCON's test labels are private, so none of them is a leaderboard score.

The source contract has no write, stimulate or configure method, and none will be added without a separate safety design. The server runs on stdio with no telemetry; HTTP is opt-in, refuses to bind off loopback without a bearer token, and the README says to put TLS in front of it. No third-party data is bundled and every adapter returns the dataset's license and citation. Of the 52 tests, 51 run offline with ruff in GitHub Actions and one streams a real file from DANDI on demand. Published under CC0 as `io.github.happyc0der/ephys-mcp`; research software, not a medical device.

### Ledger (`ledger`)

Revenue-forecast agent with receipts, built for Block Convey's Money Talks 2 hackathon: every number and buyer quote is checked in code before a finance team sees it.

- 2026 · Hackathon entry, result pending · tags: swe ml data · on no resume
- https://github.com/happyc0der/ledger
- stack: Python, FastAPI, pandas, SQLite, Claude Sonnet 5.5, Gemini, Ollama, PRISM, pytest
- stats: 94% recall, 0 of 86 false alarms · 97 to 0 fabrications · 5 models compared
- Solo entry for the Money Operations track of Block Convey's AI x Fintech hackathon Money Talks 2 (2026-10-17): the model fills a fixed claim schema with verbatim buyer quotes, and code compares each claim to the CRM to build a commit and best-case forecast where every excluded dollar has a receipt.
- On 235 deals built from the public Maven CRM dataset with 18 planted anomaly types, run through the event's Claude Sonnet 5.5 gateway: Ledger found 94% of the semantic problems at 99% precision with 0 of 86 clean deals flagged and nothing invented, where the same model asked to find the issues found 72% and flagged 10, and the same model as a plain forecaster invented 6 numbers.
- Compared five models under one pipeline (Gemini, Sonnet 5.5, Opus 5.5, and local 12B and 14B models): reading recall scales with model size but win-probability judgment does not, while the verification layer kept fabrications and false alarms at zero on every one; every run traced in PRISM, 27 failures logged and 26 fixed, 45 tests.

Ledger is my solo entry for the Money Operations track of Block Convey's AI x Fintech hackathon Money Talks 2, held in New York on 2026-10-17. A finance team signs off a revenue forecast built from a CRM that reps fill in optimistically. Ledger reads the CRM snapshot and every call note and email, and answers per deal with a win probability, the buyer's objection quoted from the record and one next action. The model only reads: it fills a fixed claim schema (budget status, decision timeline, economic buyer, competitor, last promise) with a verbatim quote per slot, and code compares each claim to the CRM fields, including across deals in the same account. A claim without a quote is dropped, and every check shows as a pass or fail receipt in the UI.

The demo company comes from the public Maven Analytics CRM dataset: the 228 open deals of one team, with their real later outcomes hidden from the agent. The source has no text, so I generated call notes conditioned on each deal's real outcome and planted 18 anomaly types, such as a stage that contradicts the buyer, a contact who left the company or a promise that expired. On the resulting 235 deals a CRM-rules baseline finds 0% of the semantic anomalies, the same model asked to list issues finds 32% and falsely flags 15 of 86 clean deals, and Ledger finds 92% at 100% precision with 0 clean deals flagged. Against the real outcomes, the naive v1 captured 60% of the closable revenue in its top 20 and fabricated 97 amounts, day gaps or quotes; v3 captures 77% and fabricates none. Objection and next-action accuracy (82% to 94%, 87% to 92%) are scored against labels I planted, so I read them as a check that the model hears the buyer, not as independent truth.

On the day, the event required model calls through the Nicrron gateway, so the whole benchmark was re-run on Claude Sonnet 5.5 with no prompt changes: Ledger found 94% of the semantic anomalies at 99% precision with 0 of 86 clean deals flagged and no fabrications, against 72% and 10 false alarms for the same model asked to list issues, and 6 invented numbers for the naive v1 forecaster on the same model. The same pipeline on Opus 5.5 and on local gemma4:12b and qwen3:14b models showed that reading recall scales with the model while win-probability judgment does not, and that the verification layer holds fabrications and false alarms at zero on every model.

Every model call and agent run is traced in PRISM, the sponsor's observability tool. Its PII guardrail flagged phone numbers in v1 traces that do not exist in the data; the local model I used to paraphrase the notes had invented them. That failure and 26 others, each with its evidence and attribution and all but one with a fix, are in FINDINGS.md, and a deterministic auditor now re-finds them without ground truth. No prompt or model setting was changed after seeing results; the fixes were comparison bugs and label gaps, all listed.

The rest is built for a weekly loop: run history in SQLite, a lifecycle per finding, draft CRM updates a person approves before export, per-rep digests, HubSpot and Salesforce ingest presets, and a FastAPI page with a receipt beside every claim. 45 tests pass with no model calls. The code is public; the hackathon result is not yet announced.

### NYC AutoDDG (`nyc-autoddg`)

PySpark profiler and local-LLM description generator for NYC Open Data, with benchmarks of where Spark beats pandas.

- 2026 · tags: data ml · resumes: data
- https://github.com/happyc0der/nyc-autoddg
- stack: Python, PySpark, pandas, PyArrow, Ollama, Databricks, rank-bm25, pytest
- stats: 4.8M rows in 2.3 min · 97% claims grounded · +12 pts Recall@1
- Built a single-pass PySpark profiler that infers column types, statistics, semantic types and data-quality flags for 100 NYC Open Data datasets (4.8M rows) in 2.3 min, down from 12 min, verified against a pandas oracle by 7 tests.
- Benchmarked Spark on an M4 Pro and Databricks serverless: near-linear speedup to 8 cores, a Spark vs pandas crossover at 1.7M rows, and pandas across 14 processes 14x faster than the best Spark setup on the small-file catalog.
- Generated AutoDDG-style descriptions with a local qwen3:14b from the profile alone; 97% of checkable claims matched the profile, and appending the search-focused one to portal metadata raised Recall@1 on tag queries from 0.605 to 0.728.

NYC Open Data publishes about 2,400 datasets, and their descriptions are thin: across the 100 I sampled, the median is 69 words and names 7% of the columns. AutoDDG (Zhang et al., 2025) profiles a dataset and prompts an LLM for a user-focused and a search-focused description. I built the profiling half on Spark, ran the LLM stage on a free local model, and measured where each choice paid off. It was a one-week Big Data course project on a 24 GB M4 Pro shared with other jobs.

The profiler computes integer, float, timestamp, boolean and text statistics for every column in one aggregation and decides the type afterwards from parse-success ratios. Three code decisions beat adding cores beyond 8: parsing only values whose shape matches a regex, so failed casts never happen (about 5x), one pass instead of one job per statistic (1.9 to 2.8x), and running jobs for small files concurrently (4x). Profiles also carry data-quality flags, such as 1900-01-01 placeholder dates and ZIP codes outside NYC, that the LLM turns into caveats. A pandas reimplementation is the single-node baseline and the test oracle.

Speedup is near-linear to 8 cores (6.4x on 3.46M rows), and 14 cores are slower than 8, because the input is 16 Parquet row groups that Spark cannot split and the M4 Pro's efficiency cores become stragglers; rewriting the data as 56 files plus speculative execution matched the 8-core time but never beat it. Spark passes pandas at about 1.7M rows, and for the 100 small catalog datasets pandas across 14 processes took 6.6 s against 92 s for the best Spark configuration. Databricks serverless was 20% faster than the laptop on the 3.46M-row dataset and 2.3 to 4.7x slower on twenty small ones. The benchmark harness waits for a quiet machine, re-checks after each run, and records load on every row.

qwen3:14b wrote both descriptions for all 100 datasets from the profile alone, never seeing the original text. Of 295 checkable claims in the user-focused descriptions, 97.3% matched the profile (97.8% of 180 in the search-focused ones), and most of the 12 flagged across both were checker false positives such as rounding. A separate llama3.1:8b judge scored the generated descriptions higher on completeness and readability than the portal's own. With BM25 over tag-based queries, appending the search-focused description to the original metadata raised Recall@1 from 0.605 to 0.728, while replacing the originals did not hold up, since they still won on queries derived from their own wording.

### trading-agent (`trading-agent`)

Cost-aware trading research harness and paper-trading runner on Alpaca and Interactive Brokers, where no model has been promoted to live trading.

- 2026 · not public · tags: quant ml swe · resumes: quant
- stack: Python, pandas, LightGBM, TabPFN, Chronos-2, Kronos, Alpaca, Interactive Brokers, Zerodha Kite
- stats: 14 US and 13 NSE models · 0 promoted to live · 136 tests
- Built a cost-aware evaluation harness (purged walk-forward, CPCV, Deflated Sharpe, PBO, random-portfolio null) and ran 14 models, from vol-targeted baselines to LightGBM, CatBoost and TabPFN meta-labeling and the Chronos-2 and Kronos foundation models, on 8 US ETFs over 2011 to 2024.
- No candidate in that run beat the vol-targeted equal-weight baseline after costs (best 0.68 Sharpe against 0.81), so none was promoted; zero-shot Kronos called 5-day direction right 46.6% of the time on US ETFs, and its sampled paths, tested later as a regime signal, earned no higher average daily return than the plain 200-day trend rule on SPY, QQQ or Bitcoin.
- Shipped the execution path anyway: Alpaca, Interactive Brokers (through IB Gateway) and Zerodha Kite adapters, two paper accounts on a launchd schedule, simulated shadow accounts forward-testing unpromoted models, a decision journal, drawdown throttle, persistent kill switch, deterministic client order IDs, and four separate gates before real money.

I built this to answer one question before any money moves: which of the models the literature recommends still work on liquid US ETFs after retail costs. On the original 8 ETFs the answer so far is none of them, and the repo is built so that result cannot be tuned away.

The harness decides at the close and executes at the next open, runs a purged walk-forward with quarterly refits and a 5-day embargo, adds CPCV paths, a Deflated Sharpe computed over every trial ever recorded, the probability of backtest overfitting, and a random-portfolio placebo with the same exposure and switching rate. It simulates the $100 account planned for live trading: $10 minimum order, fractional shares, full spread and fees. Data from 2025 onward is an untouched holdout. Fourteen entrants ran on 8 ETFs over 2011 to 2024: four baselines, a jump-model regime switch, LightGBM, CatBoost and TabPFN meta-labeling on triple-barrier labels, Chronos-2 and Kronos as standalone signals, and an ensemble.

Vol-targeted equal weight scored a net Sharpe of 0.81. The best candidate, the regime switch, scored 0.68 and beat the baseline in 0 of 5 segments. The meta-labeled models turn the book over 16 to 19 times a year and drop from roughly 0.5 to 0.6 gross Sharpe to about 0.3 net. Chronos-2 called the 5-day direction right 51% of the time, below the 56% from always predicting up. Kronos, which reports a profitable CSI300 backtest in its own paper, hit 46.6% zero-shot and 47.4% after fine-tuning on the same ETFs. The probability of backtest overfitting across all 14 trials was 0.06, so the baselines win in and out of sample alike; with later trials on the same ETFs it reached 0.57 at 52. The same harness with 13 models on 5 NSE ETFs came closer: the regime switch reached 1.08 against 0.93 and won 3 of 5 segments, but matched random portfolios reached 1.11 at their 95th percentile, so it stays on a watch list.

On stock and bond ETFs, later tests found more growth than SPY only with leverage: the 200-day trend rule over six ETFs that include 2x funds made 11.9% a year against 11.6% from mid-2008 through 2024, with a 19% maximum drawdown against 48%, though random timing of the same funds earns a similar Sharpe. Rule-based lines on universes with Bitcoin pass the promotion rule against SPY, but those universes were chosen knowing Bitcoin's history, so they run only in shadow accounts. Rules built on sampled Kronos paths earned no higher average daily return than the plain 200-day trend rule over the full windows on SPY, QQQ or Bitcoin; the few higher Sharpes came mostly from holding less.

The execution side runs regardless, with rules that were not promoted. Alpaca paper trading began on 2026-09-24 with the vol-targeted baseline and a persistent kill switch at a 10% drawdown or a 3% daily loss. An Interactive Brokers paper account joined through IB Gateway on 2026-10-19, trading that six-ETF trend rule plus a pilot sleeve of micro futures, and the Alpaca account moved to the same rule on 2026-10-29, both with the kill switch widened to a 35% drawdown or an 8% daily loss. Nothing is cleared for real money, which needs four things at once: a live account, a config flag, a promoted model and a command-line flag.

Simulated shadow accounts forward-test unpromoted models on live Alpaca data with no orders sent, and a decision journal scores what each model predicted once the horizon has passed. A Zerodha Kite adapter covers the Indian side, which has only run in dry-run mode so far. The repo is private, with 136 offline tests that CI runs on each push to main.

### GridSentry (`gridsentry`)

Post-hackathon audit, fixes, test suite and CI for Utkarsh Mittal's NEPA environmental permit agent (FastAPI and Next.js).

- 2026 · tags: swe data · on no resume
- https://github.com/UtkarshMitta/GridSentry
- live: https://grid-sentry-web.vercel.app
- credit: The app is Utkarsh Mittal's (UtkarshMitta on GitHub): the hackathon build and the first 4 commits are his. The post-hackathon audit, the fixes, the test suite, the linting and the CI are mine, as 7 commits plus the merge of PR #1, 8 of the repo's 12.
- stack: Python, FastAPI, pytest, TypeScript, Next.js 14, Leaflet, GitHub Actions, ruff
- stats: 0 to 111 API tests · 25 web, 9 live checks · PR #1: 48 files
- Audited a hackathon NEPA permit agent against the live federal GIS services for about 17 sites: non-US sites came back as clean, critical habitat was never detected, a dead data service was reported as clean, and two citations were to a nonexistent statute and a rescinded rule.
- Fixed the data pipeline, citations and UI in PR #1 (48 files, 3,668 additions, 887 deletions), then 7 more bugs in a review pass, including a protected-land query that kept 25 of up to 329 nearby records and could drop the park a site sits in.
- Took tests from 0 to 111 offline API tests, 25 web tests and 9 opt-in live checks, added ruff and ESLint, and CI on Python 3.12 and 3.14; the app is live at grid-sentry-web.vercel.app.

GridSentry is Utkarsh Mittal's NEPA environmental permit agent, built at a hackathon. You give it the coordinates of a proposed energy project and it queries federal datasets (USFWS wetlands and species, FEMA flood zones, USGS protected areas), runs three agents (a geolocation analyst, a legal compliance officer and a red-team critic) and writes a cited environmental assessment draft. The app and the hackathon build are his. He added me as a collaborator, and the audit, the fixes, the tests and the CI are mine.

Several claims in the README were not holding, so I ran the real pipeline against the live federal services for about 17 sites, checked every citation and clicked through the UI. London and Mexico came back as low risk with a Categorical Exclusion likely, because the US-only datasets returned nothing. Critical habitat was never detected: IPaC returns populationSid as an object, so the ID match could never succeed. A data service that did not respond was reported as clean. State law was cited even when the jurisdiction had not been verified. Two citations were wrong: 54 U.S.C. § 101905 does not exist and 40 CFR 1501.3 was rescinded on 2025-04-11. The site acreage was a random number seeded from the coordinates.

PR #1 (48 files, 3,668 additions, 887 deletions) added a coverage gate for non-US and offshore sites, fixed the habitat match, marks a missing layer NOT ASSESSED so it blocks a Categorical Exclusion, verifies the state with the keyless US Census geocoder, corrects the citations, makes acreage an input, and generalizes geometry so a run stores hundreds of KB instead of 4 to 10 MB. A second review pass found 7 more bugs, among them a protected-land query that kept 25 of 152 to 329 nearby records in arbitrary order and could drop the park the site sits in, and a failed database write that reported a run as complete. Each fix has a regression test that fails on the old code. After the merge I added typed API response models, a run history on the home page, ruff and ESLint, and GitHub Actions CI that runs both suites, both linters, the typecheck and a build on Python 3.12 and 3.14.

Tests went from 0 to 111 offline API tests (parsers on recorded real payloads, gates, report logic, the API and SSE lifecycle), 25 web tests and 9 opt-in checks against the live federal services. The site is live at grid-sentry-web.vercel.app, with the API on Render.

### Econometrics re-analysis (`econometrics-india`)

Re-analysis of my 2023 econometrics team project on crop yields and infant deaths across 673 Indian districts: the original headline effects were artifacts of the crop-index construction and of iid standard errors.

- 2026 · team of 5 · tags: data quant · resumes: data quant
- https://github.com/utkar22/Econometric-Analysis-of-Agriculture-and-Health-Across-India
- credit: The repository is Utkarsh Arora's (utkar22 on GitHub). The 2023 coursework was a team of five: Utkarsh Arora, me, Krishnasai Addala, Samarth Raina and Sejal Kardam. The 2026 re-analysis, the data pipeline, the R models, the review, the CI and the license are mine, merged as PR #1.
- stack: R, fixest, data.table, Python, pandas, GNU make, GitHub Actions
- stats: 673 districts, 6 years · tables match to 6 dp · within-R2 under 0.02
- Re-analyzed my 2023 econometrics team project on crop yields and infant deaths across 673 Indian districts and six years: I reproduced both original regression tables to six decimals, then showed the crop indices were the yield of whichever crop row came first in the CSV, so the Kharif cash-crop effect (p < 1e-16 originally) is not significant once the index is built per category and the nitrate sample restriction is lifted.
- Rebuilt it as a deterministic pipeline, Python for a 3,585-row district-year panel with Census 2011, NFHS-4 and IMD rainfall joined through LGD district codes, R in fixest for six specifications with state-clustered standard errors and district and year fixed effects, under which the child-marriage and hospital-bed effects are indistinguishable from zero and within-R2 is below 0.02.
- Wrote the review, archived the original scripts with seven run-breaking bugs fixed, added a GPL-3.0 license and CI that reruns the whole pipeline on Ubuntu and fails if any committed table, the panel or the README changes; merged as PR #1 (114 files) with three follow-up commits for the CI and cross-platform reproducibility.

In 2023, five of us at IIIT Delhi (Utkarsh Arora, me, Krishnasai Addala, Samarth Raina and Sejal Kardam) wrote an econometrics course project asking whether crop yields, health-system indicators and state economics explain the share of reported infant deaths attributed to low birth weight across 673 Indian districts from 2011 to 2016. The repository is Utkarsh Arora's. In September 2026 I went back to it on my own to check whether the results held. They did not.

I started by reproducing both regression tables in the original README, which worked to six decimals but only with log(tap) in the Kharif model, where the committed script used tap in levels. The real problem was the crop indices: the script kept the first crop row of each district-year in whatever order the CSV had, so cash_index was that row's yield if it happened to be a cash crop and 0 otherwise. In the Kharif sample the kept row was a cash crop for 1,576 district-years and a cereal for 772. The Kharif and Rabi tables were the same annual outcome and regressors with a different first row. GDP, hospital beds, child marriage and nitrate vary only by state, but the standard errors were iid over 24 states, and clustering by state multiplies them by 2 to 3. With the indices rebuilt per category, clustered errors and the nitrate sample restriction lifted, the three headline effects go: child marriage from -0.08 (p < 0.001) to -0.01, hospital beds from -3.9 (p < 1e-8) to -2.8 (p = 0.13), and the Kharif cash-crop index from -0.20 (p < 1e-16) to -0.08 and not significant. The report's drop in child-marriage cases in 2014 is not in the data either: the yearly state totals are 214, 304, 240, 277, 298 and 321.

The rebuild is a Python data-preparation step and an R analysis. Python collapses the 41,773 crop rows to one row per district-year (3,585 rows) with per-season, per-category yield indices, within-district yield shocks and lags, and joins Census 2011, NFHS-4 and IMD monsoon rainfall through Local Government Directory district codes (594 of the 673 districts exist in Census 2011). R runs six specifications in fixest, from the original regressors with corrected indices through year and zone effects, district and year effects, Census and NFHS controls and lags, all with state-clustered standard errors. Between districts, two associations survive a 999-draw district cluster bootstrap: a higher state GDP per capita goes with a higher LBW share (+6.5 points per log point, 95% CI 4.0 to 9.0), which reads as cause-of-death reporting rather than nutrition, and a higher rabi cereal yield with a lower one (-1.5 per tonne per hectare, CI -1.9 to -1.0). Within districts over time nothing in the data moves the outcome: within-R2 is below 0.02 with district and year effects. Monsoon rainfall is too weak an instrument for yields (clustered first-stage F = 2.3), so no causal claim is made.

The original scripts are archived under legacy/ with seven run-breaking bugs fixed and nothing else changed, plus a map from each script to the two course reports. make all rebuilds everything and a second run produces no diff; generated CSVs are rounded (10 significant digits for the Python panel, 6 for the R tidy tables) so macOS and Linux agree byte for byte, and a GitHub Actions workflow reruns the pipeline on a clean Ubuntu runner and fails if any committed table, the panel, the codebook or the README changes. The review is in docs/REVIEW.md, with a final section recording an independent recomputation of the derived columns and of the fixest estimates against lm and sandwich. I added a GPL-3.0-or-later license. The work went in as PR #1 (114 files changed), merged by Utkarsh Arora, plus three follow-up commits on main for the CI and reproducibility; the latest run is green.

### Hawk signature study (`hawk-signature-study`)

Report, talk and a working keygen, sign and verify demo of Hawk, the lattice signature scheme withdrawn from NIST standardization in July 2026.

- 2026 · tags: sec swe · resumes: sec
- https://github.com/happyc0der/hawk-signature-study
- stack: Python, NumPy, SymPy, Flask, pytest
- stats: 13-page report · 6 fixes to hawk-py · ~300x faster verify
- Study of Hawk, the hash-and-sign lattice signature scheme withdrawn from NIST's Additional Digital Signatures process on 29 July 2026, for CS-UY 3943 Post-Quantum Cryptography at NYU Tandon: a 13-page report on the algorithms, parameters and security reductions, a talk, and a Flask server exposing key generation, signing and verification over a JSON API with a demo page.
- Applied six correctness fixes to the vendored hawk-py reference code, each with a reproduction in PATCHES.md and with regression tests for the decoder and sentinel bugs: NumPy 2 integer promotion that made every verification fail, decoder bounds and failure-path bugs that crashed instead of rejecting malformed input, and a modular exponentiation fix that made Hawk-256 verification about 300x faster (6.04 s to 0.02 s) and cut the test suite from 30 s to 2 s.
- Kept the report and slides unedited after the break and documented the attack beside them: a polynomial-time reduction of Hawk-n key recovery to SVP in dimension n/2 + 1 that took the claimed cost from 2^150 to 2^108 for Hawk-512 and 2^288 to 2^182 for Hawk-1024, with Hawk-256 keys recovered end to end by the attack's authors.

A course project for CS-UY 3943, Post-Quantum Cryptography, at NYU Tandon in spring 2026: a 13-page report on Hawk's algorithms, parameters, security reductions and cryptanalysis, a talk, and a Flask server that serves key generation, signing and verification as a JSON API with a demo page for an Alice to Bob walkthrough. The report and slides were submitted on 8 June 2026. Seven weeks later the scheme was broken and withdrawn. I have kept them exactly as submitted, with the break documented on a separate page next to them.

Hawk was a hash-and-sign signature over the power-of-two cyclotomic ring whose security rested on module-LIP rather than the SIS and LWE assumptions behind ML-DSA and Falcon. That diversity was its selling point, along with 555-byte Hawk-512 signatures and no floating point in signing or verification. On 28 July 2026 Straznickas and Weis published an unconditional polynomial-time reduction of Hawk-n key recovery to SVP in dimension n/2 + 1, roughly half the dimension the parameters were sized against, and the Hawk team withdrew the submission the next day. Claimed key-recovery cost fell from 2^150 to 2^108 for Hawk-512 and from 2^288 to 2^182 for Hawk-1024, and the authors recovered real Hawk-256 keys. My report had named the long-term hardness of smLIP over CM fields as the primary open question and said Hawk was poised for standardization if that assumption held up over the next two years. It held up for seven weeks.

The demo vendors the hawk-py Python reference implementation, and getting it to run on current NumPy meant fixing it. NumPy 2 integer promotion made every verification fail, a decoder check used `and` where the specification says `or`, so random input raised IndexError instead of being rejected, a length check compared bits against eight times the bit length and could never fire, and two failure paths returned the wrong sentinel and crashed instead of rejecting. Replacing `(g ** b) % p` with `pow(g, b, p)` in the root finder, which had been building a number of roughly 130 million bits before its first modular reduction, made Hawk-256 verification about 300x faster, 6.04 s to 0.02 s, and cut the test suite from 30 s to 2 s with bit-identical output. Every change is listed with a reproduction in `PATCHES.md`, and the tests cover round trips, spec-conformant encoded sizes, tampered messages, wrong keys, corrupted and truncated signatures and random garbage.

The server is a teaching tool. It keeps private keys in plaintext in process memory, has no authentication and binds to 127.0.0.1 on purpose. The vendored Python is not constant-time and 10 to 100x slower than the C implementation, so the timings in the README are illustrative. Nothing in the repository should be used to protect anything.

### One-time-pad allocation (`otp-pad-allocation`)

Wait-free one-time-pad allocation for m broadcasting parties, with a proof of no reuse and an exact waste bound that does not grow with the pool.

- 2025 · team of 3 · tags: sec swe · resumes: sec
- https://github.com/happyc0der/cryptography-project-1
- credit: NYU CS6903/4783 Project 1 with Aaron Wu and Shuhua. The October 2025 version is the team's static-partition baseline. The chunk-reserve protocol, the proofs, the adversarial simulator, the tests, CI and the report are from my September 2026 rewrite.
- stack: Python, pytest, ruff, GitHub Actions
- stats: 36 vs 4,000 wasted pads · 310 tests · 0 blocked sends
- Designed a wait-free one-time-pad allocation protocol for m broadcasting parties with up to d messages in flight, with a proof that no pad is ever reused and an exact worst-case waste of d(2m-1) - m + (n mod d) pads, independent of the pool size n.
- Cut worst-case waste in the evaluation grid at m=5, d=5, n=5,000 from 4,000 pads under the static-partition baseline to 36, with zero blocked sends in every cell of that grid, where each cell is the worst case over 4 delivery orders, 2 network pressures and 3 seeds.
- Found two defects in the course handout's own two-party protocol, an off-by-one gap check and a pointer view that can move backwards under out-of-order delivery, each pinned by a test; 310 tests and CI that reruns the evaluation and diffs the committed results.

m parties share n one-time pads. Every message is broadcast to all the others at the same instant, at most d messages are undelivered at any moment, and nobody takes turns. No pad may ever be used twice, and when the pads run out as few as possible should be stranded. The obvious answer, a fixed slice of the pads per party, is trivially secret, but a party can only spend its own slice, so one talkative party strands 4,000 of 5,000 pads at m=5. That static partition was the team's October 2025 version of this project, with a simulator that never modeled delivery delay.

In September 2026 I replaced it with chunk-reserve. Pads are grouped into chunks of d. Each party has a private current chunk and a public reserve chunk, and everyone replays one rule over the delivered history: when a delivered message from party j uses a pad inside reserve[j], reserve[j] moves to the next chunk that has never been assigned. Delivery is simultaneous, so the delivered history is common knowledge and every party computes the same reserve map with no requests, grants or acknowledgements. The reserve map is a partition of the chunks, which gives secrecy with no timing assumption at all. A chunk size of exactly d gives wait-freedom, and d-1 does not. Worst-case waste is d(2m-1) - m + (n mod d), an equality rather than a ceiling: the worst schedule is a party that sends once and then goes quiet, which none of the first five schedules in the grid produced. They reported 20 wasted pads at m=5, d=5; the one_shot schedule reaches 36, and it stays 36 at n=5,000, 20,000 and 80,000. The proved bound there is 40; the last d-1 pads need the draining party to stop mid-chunk too, which no schedule can express, so a unit test constructs that case directly.

The simulator is built to be unkind: four delivery orders including one that holds back the message each party is waiting on, a lazy mode that keeps the backlog at the full d, and both readings of the d bound. Every pad handed out is checked against every pad before it, so a completed run is a proof of no reuse for that schedule, and a deliberately broken protocol confirms the check fires. The 310 tests run in about 8 seconds. CI runs them on Python 3.11 to 3.13, lints, and diffs the committed 180-cell summary.csv against a fresh run of the evaluation, so a protocol change that was never re-evaluated fails the build. Implementing the handout's two-party protocol as a reference turned up two defects in it: the gap check is off by one, and taking the newest arrival at face value lets a party's view of the other's pointer move backwards under LIFO delivery.

A second protocol, GrantProtocol, covers the weaker model where a sender gets no feedback about its own messages; it matched chunk-reserve on waste under the first five schedules, strands 56 pads to chunk-reserve's 36 under one_shot at m=5, d=5, and pays for its round trips in stalls. The 15-page report in the repo has the proofs, the evaluation and the limits: the (m-1)d optimality argument covers only the case where m-1 parties are silent from the start, and everything is simulated in one process rather than distributed.

### garmin-connect-api (`garmin-connect-api`)

Typed Python library, local HTTP service and MCP server that read and write Garmin Connect, including completed strength sessions; released on PyPI and the official MCP Registry.

- 2026 · tags: swe · on no resume
- https://github.com/happyc0der/garmin-connect-api
- stack: Python 3.12, FastAPI, FastMCP, pydantic, fit-tool, Typer, python-garminconnect, pytest
- stats: 38 MCP tools, v0.3.2 on PyPI · 487 offline tests · Linux, macOS, Windows CI
- Read/write layer for Garmin Connect with one typed core and three faces: a Python library, a 43-operation FastAPI service and 38 MCP tools, all but four generated from its routes so the tools cannot drift from the API.
- Uploads completed strength sessions, which Garmin's own developer program has never offered, as FIT files with set messages; the file serial is hashed from the session so an identical re-upload is reported as a duplicate, and the upload and later set corrections are verified live on my own account.
- 487 offline tests against real Garmin payload shapes, the FIT round trip, the 1,527-entry exercise catalog and every MCP tool's output schema, run in CI on Linux, macOS and Windows; released as v0.3.2 on PyPI and the official MCP Registry, and listed in awesome-mcp-servers.

Garmin Connect has no public API that a person can use for their own account. The official developer program is for businesses, has been closed to new applicants since spring 2026, and has no endpoint that uploads a finished workout. I built this so I could read and write my own account from Python, from HTTP, or from Claude.

The library returns pydantic models with Garmin's inconsistencies ironed out: weights in kilograms, instants as timezone-aware datetimes, snake_case throughout, and the untouched payload kept on `raw`. `garmin serve` puts 43 operations on localhost with OpenAPI docs. `garmin mcp`, or `uvx garmin-connect-api` from PyPI, turns those same routes into MCP tools with FastMCP, plus four hand-written ones (account status, exercise lookup, recent strength sessions with their sets, a week summary), 38 in all. Raw file downloads and sample-level detail stay off the tool list so they do not flood a context window. Each tool is annotated as reading (24), adding (8) or deleting and overwriting (6), so a client can ask before running the writes, and every argument carries a description.

Reads cover activities with per-set strength detail, laps and pool-swim lengths, daily health, twelve-metric trends over up to two years and named personal records. Writes cover strength, run, ride and swim workouts, completed sessions, set corrections and weigh-ins with body composition.

Logging a completed session is the part nothing official offers. I encode it as a FIT file with set messages and post it to the upload service the Connect website itself uses. The file serial is hashed from the file's own contents, so logging the identical session again is reported as a duplicate rather than added as a second activity. Every write except the raw workout DTO is first validated against the bundled catalog of 1,527 exercises in 47 categories, and an unknown name gets near misses back instead of Garmin's bare 400. The password is typed in exactly one place, `garmin login`; the service and MCP server only read stored tokens and answer 401 without them. Garmin added Cloudflare fingerprinting and per-account rate limits in March 2026, and a run of failed logins can lock an account for a day or more, so nothing here retries a login and a rate limit stops every call path instead of being retried.

This goes through `python-garminconnect` and Garmin's private endpoints, so it is unsanctioned by Garmin's terms and meant for one's own account. I have run it against my real account: reads, the day summary, the MCP tools, the workout create, schedule, unschedule, delete cycle, body composition writes, the completed-session upload, set edits, and a workout push queued for my watch. The first live upload worked but showed what the offline tests could not. Garmin's reply is an asynchronous "accepted" with no id, so the new activity is now found by its exact start instant, and without record messages in the FIT file a connected app dated the session at upload time. After those fixes the upload passed end to end: found, renamed, sets checked, cleaned up.

It is released as v0.3.2 on PyPI, through trusted publishing, and on the official MCP Registry as `io.github.happyc0der/garmin-connect-api`. It is MIT licensed and listed in awesome-mcp-servers. CI runs the 487 offline tests on Linux with Python 3.12, 3.13 and 3.14, on Windows and on macOS, with ruff and mypy clean. Five review rounds followed the first release, each finding reproduced before it was fixed and each fix given a test that fails without it, which took the suite from 231 tests to 479. The latest release fixes a trend summary that treated today's running count as a finished day, reported by an outside user.

### localagent (`localagent`)

Local-only LLM agent with image generation, QLoRA fine-tuning and a story-to-comic pipeline, split across a Mac and a Windows GPU laptop.

- 2026 · not public · tags: ml swe · on no resume
- stack: Python, Ollama, Qwen3-14B, PyTorch, diffusers, PEFT, SDXL, llama.cpp
- stats: 49 tok/s Qwen3-14B · 0.4 s per fast image · 5-page comic, 25 panels
- Local agent harness in Python: Qwen3-14B under Ollama with a tool-calling loop over seven shell, file and image tools; the agent runs on a Mac and reaches the models on a Windows GPU laptop through an SSH tunnel.
- Two image services on the GPU box, SD-Turbo at about 0.4 s per 512 px image and FLUX.1-schnell in 4-bit at 28 to 36 s per 1024 px image, plus a QLoRA pipeline that fine-tunes Qwen3-14B (about 2 hours at default settings) and imports the result into Ollama through llama.cpp in about 10 minutes.
- September story-to-comic pipeline: the LLM wrote a panel script, SDXL drew each panel in about 12.5 s and Pillow lettered the pages, with SDXL style and character LoRA training and a 5-page, 25-panel Alice in Wonderland example.

An assistant that runs entirely on hardware I own: no cloud provider, no API keys. Qwen3-14B runs under Ollama on my Windows laptop (RTX 3080 Ti, 16 GB) at about 49 tokens per second. The agent itself runs on the Mac and reaches the models through an SSH tunnel, so its shell and file tools act on the Mac's files and nothing is opened on the Windows firewall. Tool arguments are validated before a call and every error goes back to the model as text it can correct from. Reasoning is off by default: it made a simple reply about 30 times more expensive, on every tool call.

Two image services sit on the GPU box: SD-Turbo for fast images (about 0.4 s at 512 px, loaded next to the LLM) and FLUX.1-schnell in 4-bit for quality (28 to 36 s at 1024 px, with the LLM unloaded). A QLoRA pipeline fine-tunes Qwen3-14B on a folder of documents or captured agent conversations at about 2.9 s per example with a 12.0 GB peak, about 2 hours at the default 600 steps of 4 examples. It then merges the adapter, converts it to GGUF with llama.cpp and imports the result into Ollama, which takes about 10 minutes.

The September comic pipeline turned a story into lettered pages: the LLM wrote a panel-by-panel script, SDXL drew each panel in about 12.5 s, and Pillow added borders, speech bubbles and captions. It could also cut existing comic pages into panels, describe them with a local vision model, and train SDXL style and character LoRAs. At 768 px and rank 16, a training step of 2 images took 0.95 s on an otherwise idle GPU (13.6 GB peak), or 3.25 s with gradient checkpointing (5.6 GB peak). Its example was Alice's Adventures in Wonderland, chapter I: 5 pages, 25 panels, about 5 minutes of art.

It is deliberately not a git repository. There are no automated tests.

### OW2 Career Tracker (`ow2-career-tracker`)

Personal Overwatch 2 dashboard that snapshots my public career profile every three hours and charts every hero's stats over time.

- 2026 · tags: swe data · on no resume
- https://github.com/happyc0der/ow2-career-tracker
- live: https://happyc0der.github.io/ow2-career-tracker/
- stack: Python, FastAPI, SQLite, httpx, JavaScript, Chart.js, uv
- stats: snapshot every 3 h · stores only changes · per-hero history
- Blizzard's career profile only shows current lifetime totals, so the tracker builds history itself: a scheduled sync pulls the profile through the OverFast API and stores a new point in SQLite only when the data changed.
- A FastAPI server and a plain HTML, CSS and Chart.js front end show the player banner and rank, headline stats, win rate and KDA over time, the role split and every hero's detail tables, for Quick Play and Competitive.
- One command runs it with uv; a Windows installer registers a silent scheduled task every three hours and a Start menu entry, with cron for macOS and Linux. After each sync the Windows task runs owdash publish, which pushes a read-only static copy to GitHub Pages only when the exported data changed.

A personal dashboard for my Overwatch 2 account. The public career profile exposes lifetime totals per hero and per mode, not match history, so "over time" only exists if something saves snapshots. `owdash sync` fetches the profile, compares it with the last snapshot and writes a point only when something changed, which keeps the database small. `owdash serve` syncs once and opens the dashboard: player banner with endorsement and competitive rank, headline stats with changes since tracking started, win rate and KDA over time, the tank, damage and support split, and a sortable hero roster with each hero's full stat tables.

`owdash export` writes a read-only static copy, the page plus JSON for every hero and mode, and `owdash publish` pushes it to GitHub Pages after each scheduled sync, only when the exported data changed.

### Non-stationary bandits (`bandits`)

Five bandit algorithms for changing environments, benchmarked on one interface with regret split into decisions and mandatory probing.

- 2026 · tags: ml quant · resumes: quant
- https://github.com/happyc0der/multi_armed_bandit_algorithms
- stack: Python, NumPy, Matplotlib
- stats: 5 algorithms · 59x faster AdSwitch · regret 21,860 to 174
- Five piecewise-stationary bandit algorithms (TS-GE, AdSwitch, M-UCB, UCB1, epsilon-greedy) behind one interface, benchmarked on five cases from 2 to 128 arms with regret split into decision regret and mandatory probing cost.
- Audited TS-GE against its paper and found the Beta update reversed, which cut TS-phase regret from 21,860 to 174 at K=2, T=6000, and showed mandatory probing is 75.9% of its total regret on that case.
- Made AdSwitch 59x faster (218.6 s to 3.7 s at K=16, T=1e5) and cut memory from 2,048 MB to 272 MB at K=128, T=1e6, with bit-identical output.

Bandits where the best arm changes over time. I started the repo in 2022 with financial markets in mind and rewrote it in September 2026. Five algorithms (TS-GE, AdSwitch, M-UCB, UCB1 and epsilon-greedy) implement one interface and run on one bounded synthetic environment, across five benchmark cases from 2 to 128 arms.

TS-GE's paper requires it to probe every arm every episode, and the regret definition charges each probe slot no matter how well the algorithm is learning. So the benchmark reports total regret, decision regret and maximum probe age separately. At K=2, T=6000, mandatory probing is 75.9% of TS-GE's total regret, and at T=200,000 it is 98.5%. On decision regret TS-GE beats M-UCB from K=16 upward, 4.3x at K=16, and at K=16 it detects a change in 188 slots against 716 for M-UCB and 4,960 for AdSwitch. On total regret it loses, so reporting only the total inverts the conclusion.

Auditing TS-GE against its paper, I found the Beta update written backwards: as printed, the sampled value is the failure rate, so the algorithm picks the arm most likely to fail. At K=2, T=6000, seed 42, TS-phase regret is 21,860 as written and 174 corrected. I also gate post-change resets on fresh pulls of the localized arm, which took committed resets on a stationary run from 15, 10 and 13 across three seeds to zero, and a preflight check refuses parameter sets where a change cannot be detected or initialization would take more than half the horizon.

AdSwitch's evicted-arm test, evaluated naively, is O(K T^2) and was 89 to 96% of wall time. Restricting it to rounds where the arm was pulled and to that arm's own pull times, with sparse per-arm prefix sums, gives 59x at K=16, T=1e5 (218.6 s to 3.7 s) and 272 MB instead of 2,048 MB at K=128, T=1e6, with chosen arms, detections and evictions bit-identical. AdSwitch's run-to-run spread reaches 18x depending on which arm changed, so the summary carries median and quartiles beside the mean.

### map-reducer (`map-reducer`)

MapReduce from scratch in Python over gRPC, running K-Means across separate master, mapper and reducer processes, with two kinds of worker failure handled.

- 2024 · team of 3 · tags: swe data · resumes: data
- https://github.com/happyc0der/Map_Reducer
- credit: Course team project with Aditya Ahuja and Deeptanshu Barman. The September 2026 test suite, launcher and CI are mine.
- stack: Python, gRPC, protobuf, unittest, ruff, GitHub Actions
- stats: 64 tests · CI on 3 OSes · team of 3
- MapReduce framework from scratch in Python over gRPC, with the master, every mapper and every reducer as its own process on its own port, used to run K-Means; the master ships index ranges rather than data, and reducers pull their partitions from the mappers over gRPC.
- Handles both failure modes in the spec: a worker that reports a failed task is retried, and a force-stopped worker's split or partition is reassigned to a surviving worker in append mode so it keeps the work it already owns.
- 64 unittest tests check the distributed result against a from-scratch single-process K-Means to within 1e-6 over four mapper by reducer configurations, and CI runs them on Python 3.10 to 3.13 on Linux plus 3.12 on macOS and Windows, with a separate fault-injection job.

Assignment 3 of CSE530 Distributed Systems at IIIT Delhi, Winter 2024, built with two teammates over four days in April 2024. The master, each mapper and each reducer is a separate process with its own port and its own output directory, and everything between them goes over one gRPC service with four calls: Map, StartReduce, Reduce and returnCentroid.

One iteration works like this. The master splits the input by index range and never ships points. Each mapper reads its range, keys every point to its nearest centroid and writes one partition file per reducer. Each reducer then pulls its partition from every mapper over gRPC, averages each group and returns the new centroids. The loop stops when no centroid moves more than 0.0001 on either axis, or after the requested number of iterations. Failures come in the two shapes the spec asks for. A worker that answers with a failed status (injected at 5 percent per call) is retried until it succeeds. A worker that is gone, so its RPC raises, has its split handed to the next mapper or its partition to a random surviving reducer, which is told to append so it keeps the work it already owns.

The team code is from April 2024. In September 2026 I went back to it for a documentation, lint and dead-code pass, and added what the original never had: a POSIX launcher, a 64-test unittest suite organized around the assignment rubric, and GitHub Actions. The central test replays the same K-Means from the same random starting centroids in a from-scratch single-process implementation and asserts the two agree to within 1e-6, across 1x1, 3x2, 4x3 and 8x2 mapper by reducer configurations. CI runs ruff, the suite on Python 3.10 to 3.13 on Linux plus 3.12 on macOS and Windows, and a fault-injection job that force-stops a mapper and a reducer mid-run. All eight jobs are green on the latest commit, and the fast suite runs in a few seconds on the 25-point sample input.

The README lists what still breaks. An iteration that leaves a centroid with no points ends the run with an IndexError, and a split reassigned after a force-stop can be wiped if the replacement mapper's own Map call has not finished yet. The tests skip rather than fail on the first, and the second is documented as reproducible with a non-zero sleep argument.

### Library Loans Explorer (`library-loans`)

Flask front end over a relational library database: a member's full loan history and live copy availability by branch, on PostgreSQL or SQLite.

- 2025 · tags: data swe · on no resume
- https://github.com/happyc0der/library-loans-explorer
- stack: Python, Flask, PostgreSQL, SQLite, psycopg2, Jinja2, pytest
- stats: 2 database backends · parameterized SQL · pytest on both
- Built for NYU's Principles of Database Systems (Spring 2025): a member enters an ID and sees every loan they have made, then clicks a book to see which copies are on the shelf right now and at which branch.
- One codebase runs on PostgreSQL through a psycopg2 connection pool or on SQLite with no setup, chosen by one DATABASE_URL setting; one command creates the schema and loads the sample data on either.
- Every query is parameterized, bad input gets a 400 or 404, database errors are logged but not shown to users, and a pytest suite runs on SQLite by default and on PostgreSQL when pointed at one.

A small web app over a five-table library schema (members, books, branches, book copies and loans), built for Problem Set 3 of NYU Tandon's CS-GY 6083 Principles of Database Systems in Spring 2025. A loan's key is member, copy and loan date, so the same member can borrow the same copy again later, and a copy is available when it has no loan without a return date.

It was written against PostgreSQL and later made to run on SQLite as well, so it can be tried straight from a fresh clone: `flask --app app init-db` loads the sample data (5 members, 5 branches, 8 books, 36 copies, 20 loans) on either backend.

### Snakes and Ladders as a Markov chain (`snakes-ladders-markov`)

Exact game length of Snakes and Ladders from the fundamental matrix, checked against a dice simulation and 47 tests.

- 2022 · tags: quant · resumes: quant
- https://github.com/happyc0der/SPA_Project
- credit: Aman Kumar wrote the empirical transition-matrix tally in the original 2022 simulation.
- stack: Python, NumPy, Matplotlib, pytest
- stats: 39.6 turns expected · d15 is fastest · 47 tests
- Modeled Snakes and Ladders as a 101-state absorbing Markov chain in NumPy and computed the exact expected game length, 39.6 turns on a six-sided die, as a row sum of the fundamental matrix (I - Q)^-1.
- Checked the matrix against a brute-force dice simulation and swept die sizes from d2 to d24: a 15-sided die gives the shortest game at 25.8 turns, a d20 is slower than a d12, and a one-sided die can never win.
- Reworked the 2022 coursework in 2026 with 47 pytest tests that pin the exact expectation, the completion curve, the reachable squares and the simulation against the chain.

The board is squares 0 to 100 with 19 snakes and ladders, and a roll past 100 is not played, so the player stays put and loses the turn. Where you land depends only on where you are, which makes the game a 101-state Markov chain with square 100 absorbing. One 101 by 101 transition matrix then answers every question exactly. Removing the absorbing square leaves Q, and the row sums of the inverse of I - Q are the expected turns from each square: 39.5984 from the start with a fair d6. The fewest turns a win can take is 7, half of games are over by turn 33, and 99% by turn 130. This started as Stochastic Processes coursework at IIIT Delhi.

Two things fell out of the die sweep. A bigger die helps only up to a point: d6 takes 39.60 turns, d8 31.97, d15 25.84, and then the house rule bites, since more rolls near the end are too big to play, so a d20 (27.22) is already slower than a d12 (27.07). A d3 is slower than a d2 (81.18 against 72.01) because its reachable squares line up badly with the snakes. With a d1 the board cannot be won at all: the player walks 26 to 47, lands on the snake at 48, returns to 26, and repeats, with only 18 squares reachable. No turn ends on a snake's head or a ladder's foot, so 82 of the 101 squares can end a turn, and the stationary distribution is all mass on square 100, which T^n reaches to within 1e-4 at n = 165.

`simulation.py` plays games by rolling a die and tallies an empirical transition matrix to compare with the analytic one; the two agree to within sampling noise, and the simulated mean game length lands within the 5% tolerance the test allows around the exact 39.5984. I went back over the repo in September 2026, fixed bugs in the model and the simulation, and added 47 tests. One fix worth noting: the average-position figure had been plotting the tail of a single long game as if it were signal, so it is now cut at the last turn backed by at least 30 games and relabelled as the mean square of games still in play.

### Subgradient descent with momentum (`ssgd-momentum`)

Stochastic subgradient descent, with and without heavy-ball momentum, as PyTorch optimizers on LASSO and a ReLU network, checked against scikit-learn.

- 2024 · tags: ml quant · resumes: quant
- https://github.com/happyc0der/AOMML
- stack: Python, PyTorch, NumPy, scikit-learn, Matplotlib, pytest, uv, GitHub Actions
- stats: 89 tests · sklearn gap 7.4e-5 · 92.7% MNIST test
- Stochastic subgradient descent and heavy-ball momentum as torch.optim.Optimizer subclasses, with constant, 1/sqrt(k) and 1/k step schedules, optional Nesterov, and both the buffer and Polyak difference forms, applied to LASSO and a ReLU network on MNIST.
- Correctness anchored to external references and 89 tests in CI: autograd agrees with the closed-form subgradient to 4e-16, the LASSO optimum is within 7.4e-5 of scikit-learn's coordinate descent, and each update rule matches torch.optim.SGD to 1e-14.
- Showed that momentum's apparent 9.3e8x speedup on an ill-conditioned problem falls to 1.05x once the effective step is matched, and that its real benefit is stability: plain SSGD diverges above an effective step of 1.5 while beta 0.99 stays stable to 300.

A course project for Advanced Optimization Methods for Machine Learning at IIIT Delhi. Stochastic subgradient descent (SSGD) and SSGD with heavy-ball momentum are written as `torch.optim.Optimizer` subclasses and applied to two problems that are not smooth: LASSO, whose l1 penalty is not differentiable at zero, and a multi-layer ReLU network. Each runs first on synthetic data with a known ground truth, then on real data, California housing for LASSO and MNIST for the network.

The repository began in April 2024 as a seven-cell notebook that stated an intent and stopped: no optimizer, no objective, no training loop, and two of its nine defects were fatal, a hardcoded `.cuda()` call and a Boston housing URL that now returns HTTP 403. In September 2026 I rebuilt it as a package. The optimizers support constant, 1/sqrt(k) and 1/k step schedules, optional Nesterov, and both the buffer and Polyak difference forms of momentum. The training loop tracks the raw, running-best and Polyak-averaged iterates separately, because the subgradient method is not a descent method. MNIST and California housing are committed, so nothing needs the network. 89 tests run in CI alongside lint, format checks and a full execution of the notebook, and the nine original defects are covered by regression tests.

Correctness is checked against code I did not write. Autograd agrees with the closed-form subgradient to 4e-16, and at w = 0 every coordinate is a valid element of [-lambda, lambda]. The LASSO optimum is within 7.4e-5 of scikit-learn's coordinate descent with coefficients within 1.5e-3, and the true support is recovered at 10 of 10 tested lambdas. Each update rule is matched step by step and against `torch.optim.SGD` to 1e-14. On MNIST a 784-128-10 network trained for 5 epochs reaches 91.4% test accuracy with SSGD and 92.7% with momentum, selected on a held-out validation split.

Three results. The objective rose on 44% of recorded iterations while the method converged normally, so plotting only the raw iterate makes a correct implementation look broken. A constant step reaches a neighbourhood of the optimum and stops: quadrupling the budget left its gap at 5.4616, while 1/sqrt(k) kept descending. And momentum's benefit is stability rather than a better step. Comparing beta at a fixed alpha_0 suggests a 9.3e8x speedup, but that silently varies the effective step alpha_0/(1-beta); with the effective step matched, the advantage is 1.05x. What momentum buys is headroom: plain SSGD diverges above an effective step of 1.5 and beta 0.99 stays stable to 300. One limitation: plain subgradient descent does not land on exact zeros (0 of 50 coefficients, against up to 45 for scikit-learn), so support recovery needs thresholding, and a proximal method such as ISTA would be the natural next step.

### Raft with leader leases (`raft`)

Raft consensus key-value store with leader leases in Python and gRPC, from a distributed systems course; my part was the leader lease, and in 2026 I fixed six bugs and got it running on current gRPC.

- 2024 · Maintained 2026 · team of 3 · tags: swe · on no resume
- https://github.com/happyc0der/raft-leader-lease-kv
- credit: The team was Aditya Ahuja, Deeptanshu Barman and me, for CSE530 at IIIT Delhi in 2024; the repository is my fork of Aditya's Raft-Implementation with the full history. Aditya wrote the node, the election, the client handling and request forwarding. Deeptanshu wrote the replication and commit logic, the lease timers and the metadata class. My 2024 part was the leader lease and the first per-node dump and metadata files. The 2026 maintenance, the bug fixes, the smoke test and the README are mine.
- stack: Python, gRPC, Protocol Buffers, Google Cloud
- stats: 5-node cluster · 8 s leader lease · 6 bugs fixed in 2026
- Added leader leases to a team Raft implementation in Python and gRPC: the leader renews its lease (8 seconds in the final code) when its heartbeats reach a majority of the cluster and steps down when it expires, and followers hold off elections while a lease is live.
- Added a leaseDuration field to the RequestVote response next to the existing one on AppendEntries, and made the leader refuse GET and SET while it holds no lease.
- In 2026 made it run on current grpcio and protobuf and fixed six bugs: votes from earlier terms counted in later elections, a step-down that could never run, majority checks that left out the leader, a voter that did not reset its timer, an int-vs-string term comparison, and log repair that recursed once per missing entry until a follower 500 entries behind hit the recursion limit; added an end-to-end cluster smoke test.

Raft with leader leases is a course project for CSE530 Distributed Systems at IIIT Delhi in 2024, with Aditya Ahuja and Deeptanshu Barman. It started in Aditya's repository. It is a Raft cluster in Python: five nodes talk over gRPC using the two Raft RPCs, RequestVote and AppendEntries, plus a serveClient RPC that takes GET and SET commands from a small command line client and forwards them to the leader. Each node keeps its log, a metadata file (term, commit length, vote) and a dump file on disk, so a restarted node picks up where it left off. The election timeout is drawn from 5 to 11 seconds and the leader sends a heartbeat once a second. The cluster was deployed on five Google Cloud VMs.

My part was the leader lease, the idea from YugabyteDB that lets a leader answer reads without a round trip to the followers. The leader renews its lease each time its heartbeats reach a majority of the cluster and steps down to follower when the lease timer fires. My commit set the lease to 3 seconds and Deeptanshu raised it to 8 the same day. Followers learn the lease duration from AppendEntries and do not start an election while the lease is live. The RequestVote response carries a lease duration so that a winning candidate can wait out the old leader's lease before it serves. GET and SET are refused with a message while the leader has no lease. For this I added the lease field on the RequestVote response to the proto, the lease state and its start, renew and timeout handlers in the node, and the lease checks in the client path. The AppendEntries lease field and the timer class were already there from Deeptanshu.

I also added the first version of the per-node dump and metadata files, writing a line for each election timeout, vote granted or denied, lease expiry and step-down, accepted or rejected AppendEntries and failed RPC. Deeptanshu then moved the metadata into its own class. My share is small: 3 of 45 commits, on 30 and 31 March 2024. Aditya and Deeptanshu wrote the election, replication and client code around it.

In September 2026 I forked it to my own account and made it run again: current protobuf rejects `True` in an int32 field, which broke every vote, so the stubs are regenerated and `voteGranted` is a bool. The cluster addresses and data directory are configurable. I fixed six bugs: votes from earlier terms were counted in later elections, the step-down on a higher-term vote reply could never run, majority checks did not count the leader, a voter did not reset its election timer after granting a vote, a log-conflict check compared an int term with a string, and log repair recursed once per missing entry, so a follower about 500 entries behind hit Python's recursion limit and heartbeats to it failed until it caught up. The leader now repairs in a loop. RPCs have deadlines, a busy-wait loop is gone, and `scripts/demo_cluster.py` runs an end-to-end smoke test of a whole cluster.

### Assembler and Simulator (`assembler-simulator`)

Assembler and cycle-by-cycle simulator for a 16-bit teaching ISA, a three-person Computer Organization assignment at IIIT Delhi in which I wrote the simulator.

- 2021 · team of 3 · tags: swe · on no resume
- https://github.com/adityaahuja7/Assembler-Simulator
- credit: Aditya Ahuja's repository (adityaahuja7 on GitHub), a Computer Organization assignment with Aditya Ahuja and Vedant Gupta. Vedant wrote the assembler. The simulator is mine: I added its first version and 309 of its 430 lines by blame, 8 of the repo's 39 commits under my happyc0der and KeshavIIITD accounts, and Aditya and Vedant fixed 9 lines after that.
- stack: Python, bash
- stats: 20 opcodes · 256 x 16-bit words · 14 of 14 grader tests
- Wrote the Python simulator for the course's 16-bit ISA: 20 opcodes, registers R0 to R6 plus FLAGS, 256 words of memory, and a trace line of program counter, registers and flags after every instruction followed by a memory dump.
- The course grader passes all 14 assembler and simulator tests (5 simple and 2 hard for each) and rejects the 4 error programs, rerun in September 2026 on Python 3.14 for 20 of 20 marks on each half.

This was the Computer Organization assignment at IIIT Delhi in August 2021, done in Aditya Ahuja's repository with Aditya and Vedant Gupta. The course fixed the instruction set: 16-bit words, a 5-bit opcode, 20 instructions, registers R0 to R6 plus a FLAGS register, 256 words of memory, and both programs reading stdin and writing stdout. The assembler turns assembly text into binary words and the simulator runs those words. Vedant wrote the assembler, which rejects 16 kinds of error (undefined variables and labels, variables declared after code, a repeated or misplaced hlt, illegal immediates, misuse of FLAGS). The simulator is my part. My two commits to the assembler are comments.

I wrote the simulator between 18 and 21 August 2021, 309 of its 430 lines by blame. It loads the binary into memory until it reads the halt word, then loops: fetch the word at the program counter, take the top 5 bits as the opcode, run the handler, and print one line with the 8-bit program counter, the seven registers and the flags, all in binary. Add, sub and mul set the overflow flag when a result leaves 16 bits; cmp sets the less-than, greater-than or equal flag; the three conditional jumps read the flag from the previous cmp and then clear it. After hlt it dumps all 256 memory words.

The repo ships the course's grader: 5 simple and 2 hard programs each for the assembler (assembly in, binary out) and the simulator (binary in, trace out), plus 4 error programs the assembler must reject. Rerun in September 2026 on Python 3.14, every test passes, 20 of 20 marks on each half. To be exact about the share: at my last commit the simulator matched 1 of the 7 traces, and Vedant's and Aditya's later commits changed 9 lines (among them a memory word initialized with 15 zeros instead of 16, the ld instruction, and when flags reset) to reach 7 of 7. One rough edge remains: the file still calls the Matplotlib scatter plot at exit with the import commented out, so it ends with a NameError after the memory dump. The grader reads only stdout, so the trace is unaffected.

### Customer attrition (`ml-project-churn`)

Four-person IIIT Delhi machine learning course project comparing eight classifiers for telecom churn, and why its reported accuracy does not hold up.

- 2022 · team of 4 · tags: ml data · on no resume
- https://github.com/IshitBajpai/ML_Project
- credit: The repo is Ishit Bajpai's (IshitBajpai on GitHub). The project was a team of four: Ishit Bajpai, Prachi, Satyam Arora and me, with equal credit stated in the report. My share was debugging, result analysis, the train and test split, PCA and t-SNE, the dataset handling and the report. All 3 commits are Ishit's uploads of the group's notebooks, slides and report.
- stack: Python, scikit-learn, XGBoost, pandas, seaborn, Jupyter, Google Colab
- stats: 7,043 rows, 38 columns · 8 classifiers · team of 4
- Machine learning course project at IIIT Delhi in a team of four: churn prediction on the Maven Analytics telecom dataset of 7,043 customers and 38 columns, comparing logistic regression, two naive Bayes variants, SVM, random forest, AdaBoost, XGBoost and an MLP, most under 5-fold cross-validation.
- My share was debugging, result analysis, the 75:25 stratified split, PCA and t-SNE, the dataset handling and the report; the group reported an RBF-kernel SVM as best at 96.72% accuracy and 93.51 F1.
- The reported scores are inflated by target leakage: the Churn Category and Churn Reason columns, filled only for churners, stayed in the feature matrix, and the ROC-AUC helper fitted each model on the test set it then scored.

This was the final project for CSE/ECE 343 Machine Learning at IIIT Delhi, submitted on 4 December 2022 by a team of four: Ishit Bajpai, Prachi, Satyam Arora and me. The repository is Ishit's and holds the group's four Colab notebooks, the slides and the report. The task was to predict which telecom customers churn. The data is the Maven Analytics telecom churn set: 7,043 customers from one quarter of 2022, 38 columns, and a three-way status of joined, stayed or churned that we collapsed to churned (1,869 customers) against the rest (5,174). Per the slides, my share was debugging, result analysis, the train and test split, PCA and t-SNE, the dataset handling and the report.

The pipeline drops the customer ID, fills missing values with a KNN imputer (the report says mean for numeric columns, but that line in the notebook never assigns its result), label-encodes every categorical column, removes any feature correlated above 0.85 with another, drops low-variance numeric columns, standardizes, and reduces to 8 principal components. The split is 75:25 and stratified. We then ran logistic regression, Gaussian and Bernoulli naive Bayes, SVM with four kernels, random forest, AdaBoost and XGBoost with small grid searches, and an MLP with hidden layers of 256 and 32, scoring the scikit-learn models with 5-fold cross-validation and the MLP on the held-out quarter. The group's table put the RBF SVM first at 96.72% accuracy and 93.51 F1, with XGBoost highest on ROC-AUC at 99.8.

Those numbers do not hold up, and it is better to say so here than let them stand. The Maven set has two columns, Churn Category and Churn Reason, that are blank unless the customer churned. The notebooks fill them with a placeholder for everyone else and then keep both in the feature matrix, so the inputs to PCA, and through it to every model, carried a column that is zero exactly when the label is zero. On top of that, the ROC-AUC helper fits each model on the test set and scores the same rows, and PCA is fitted separately on the train and test halves. For comparison, my 2026 Telecom churn project on a 7,043-row Telco dataset without those columns reaches accuracy between 0.767 and 0.805 depending on the model and threshold.

Most of the semester went into preprocessing and rerunning results, and every model looked good because the leak made every model look good. The later project keeps each preprocessing step inside a scikit-learn pipeline and holds out the test set before anything is fitted, which is the fix for both problems.

### Noisy-label tabular models (`aml-a1`)

Course assignment comparing a plain MLP, Noise Attention Learning, a partial SubTab autoencoder, TabPFN and an LSTM on synthetic tabular data at three label-noise levels.

- 2024 · private · not on the site · team of 2 · tags: ml · on no resume
- https://github.com/WillOfSprings/aml-a1
- credit: Two-person course assignment with Pratyush Kumar (WillOfSprings on GitHub), who owns the repo and made all 13 commits. Both milestone reports list us as co-authors. The NAL MLP and TabPFN notebooks carry my laptop's run metadata (the RTX 3080 Ti both reports name as the hardware); the SubTab and LSTM notebooks ran on a different machine with a GTX 1660 Ti.
- stack: Python, PyTorch, TabPFN, pandas, scikit-learn, Jupyter
- stats: NAL 63.79% to 74.19% · TabPFN 85.31% test · 3 noise levels
- Compared five approaches on a 24-feature synthetic tabular dataset at zero, low and high label noise for two targets: a baseline MLP, the same MLP with a Noise Attention Learning loss, a partial SubTab autoencoder, TabPFN and an LSTM.
- Noise Attention Learning raised test accuracy on the era target from 63.79% to 74.19% on low-noise data and from 44.90% to 49.75% on high-noise data, and cost accuracy on clean data (76.41% to 42.05%).
- Fitted TabPFN within its 1,000-row and 10-class limits by fitting on a 1,000-row sample and chaining two classifiers, the first trained on classes 0 to 9 and handing any row it labels 9 to a second trained on classes 9 to 11, reaching 85.31% test accuracy on the 12-class era target with zero noise.

Assignment 1 of Advanced Machine Learning at IIIT Delhi, done with Pratyush Kumar in February 2024 in two milestones. The data is synthetic tabular data with 24 price-series style features per row (normalized open, high, low, close and volume, moving averages, a CMO and slope features) at three label-noise levels: a clean set of 7,800 rows, a low-noise set of 312,000 rows and a high-noise set of 249,600 rows. Each method predicts two targets, a 12-class era label and target_10_val, from a 70/15/15 train, test and validation split with seed 42.

Milestone 1 set a baseline MLP against two methods for noisy labels. Noise Attention Learning keeps the MLP and swaps the loss for the paper's attention-weighted loss, without its regularization term. It helped where noise was present and hurt where it was not: on the era target, test accuracy went from 63.79% to 74.19% at low noise and from 44.90% to 49.75% at high noise, but fell from 76.41% to 42.05% on clean data. On target_10_val the gains were small (79.11% to 80.26% at low noise). Our SubTab port was partial: an autoencoder trained on overlapping feature subsets with the reconstruction loss only, no contrastive term, feeding an MLP with the NAL loss. It scored well below the baseline (15.07% on low-noise era) and the report says so.

Milestone 2 added TabPFN and a sequence model. TabPFN fits at most 1,000 rows and predicts at most 10 classes, so we fitted on a 1,000-row sample and chained two classifiers: the first is trained on classes 0 to 9, and any row it labels 9 goes to a second classifier trained on classes 9 to 11. It reached 85.31% test accuracy on clean era data and 74.83% on low-noise target_10_val, at the cost of prediction time (186.9 s for 1,500 test rows on low-noise era in the notebook). The sequence model is a one-layer LSTM over windows of 12 rows sorted by row_num with a classification head. LSTM and GRU scored almost the same, so the report gives one number. On the era target it beat TabPFN on noisy data (62.72% against 57.6% at low noise, 46.60% against 34.58% at high noise) and trailed it on clean data.

The repo is Pratyush's and all 13 commits are his; both reports list us as co-authors. The NAL MLP and TabPFN notebooks carry my laptop's run metadata, the RTX 3080 Ti both reports name as the hardware, and the SubTab and LSTM notebooks ran on a different machine with a GTX 1660 Ti. Two things I would fix now: the SubTab training loop prints a validation accuracy of 0.00000 every epoch, so its numbers are unverified, and the milestone 1 report says every model ran for 10 epochs while the committed NAL notebook is set to 5 and prints 47.71% on high-noise era where the report says 49.75%, so the reported numbers come from runs that are not the committed ones.

### Telecom churn (`customer-churn`)

Nine scikit-learn churn models with tuned thresholds behind a Streamlit app, with tests and CI added to a forked college project.

- 2026 · tags: ml data swe · on no resume
- https://github.com/happyc0der/customer-churn-prediction
- credit: Forked from codebrain001/customer-churn-prediction. The original app, notebook and dataset are codebrain001's. The model gallery, the threshold study, the tests, the CI and the bug fixes are mine.
- stack: Python, scikit-learn, pandas, Streamlit, pytest, ruff, GitHub Actions
- stats: 9 models · 62 tests · recall 0.578 to 0.751
- Rebuilt a forked telecom churn predictor as a gallery of nine scikit-learn models on the 7,043-row Telco dataset, each with preprocessing inside the pipeline and its own tuned decision threshold, selectable in a Streamlit app.
- Swapped the original logistic regression at a 0.5 cut-off for gradient boosting at 0.31, catching 281 of 374 held-out churners instead of 216 (recall 0.578 to 0.751) while accuracy fell from 0.805 to 0.767.
- Wrote 62 pytest tests, most pinned to a bug the project had shipped and checked by putting the bug back, plus a GitHub Actions workflow that runs ruff and the suite on Python 3.11 and 3.13.

This is codebrain001's Streamlit churn predictor, which I forked in 2022 for coursework. The upstream project stopped in August 2021. In September 2026 I went back over it: 18 of the 56 commits are mine, all from that pass, and the exploratory notebook, the dataset and the shape of the app are the original author's.

The original shipped one logistic regression, trained on a 70/30 split with scaling fitted before the split. `train.py` now holds out a stratified 20% test set, keeps imputation, scaling and one-hot encoding inside each pipeline, searches nine algorithms with randomized search and 5-fold cross-validation, selects on average precision (about 26.5% of customers churn, so accuracy is the wrong yardstick) and tunes a decision threshold per model for F1. Any of the nine can be picked in the app, a compare mode scores an uploaded CSV with all of them, the whole gallery is about 6 MB, and a retrain is deterministic and takes about a minute.

The result is plain: eight of the nine models sit within 0.015 F1 of each other and only naive Bayes trails. The threshold moved more than the algorithm. Against the original logistic regression at 0.5, gradient boosting at 0.31 catches 281 of the 374 test-set churners instead of 216, and accuracy drops from 0.805 to 0.767. For a retention campaign that is the trade I wanted: a false alarm is cheap, a missed churner is not.

The 62 tests cover preprocessing, the saved models, the app through Streamlit's own AppTest, the notebook and `train.py`. They were validated by reintroducing the ten shipped bugs they guard one at a time and confirming the suite went red. One of those bugs was a `--only` flag that quietly deleted eight of the nine model files while the linter passed clean. Lint and tests run in GitHub Actions on Python 3.11 and 3.13.

### InfoViz (`infoviz`)

Streamlit dashboard of US leading causes of death, 1999 to 2017, from the CDC/NCHS dataset.

- 2025 · tags: data · on no resume
- https://github.com/happyc0der/InfoViz
- stack: Python, Streamlit, Altair, pandas
- stats: 4 views · 10,868 rows · 19 years of data
- Streamlit dashboard of US leading causes of death, 1999 to 2017: two choropleth maps, a time series with a fitted linear trend, and a per-year share by cause, built with Altair on the CDC/NCHS dataset.
- Repaired in 2026 so it runs from a fresh clone: the dataset now downloads and caches itself, and the pie chart no longer counts every death twice by summing the national rollup rows with the states.

Four views of the NCHS Leading Causes of Death dataset: 10,868 rows covering ten causes plus an All causes rollup, for all 50 states, DC and a national total, 1999 to 2017. One map shades states by raw death count for a chosen year and cause. A second shades them by age-adjusted rate per 100,000, which is the one that supports a fair state-to-state comparison. A time series shows nationwide deaths per year for one cause with a dashed linear-regression line, and a pie chart gives each cause's share of a chosen year's deaths.

The whole app is one file, `streamlit_app.py`. Charts are Altair, the maps join the data onto Vega's `us_10m` TopoJSON by FIPS code, and the three data functions sit behind `st.cache_data` so a dropdown change re-renders without re-reading the CSV. The dataset is fetched from the CDC on first run and cached next to the script.

In September 2026 I went back and fixed it. A fresh clone could not start: the CSV was never committed and an unused geopandas import blocked launch. The pie chart crashed on current pandas and, before that, counted every death twice by including the United States rollup rows in the state sum (cancer in 2017 read 1,198,216 against the true 599,108). I replaced deprecated Altair and Streamlit calls, added requirements, a .gitignore and an MIT license, and rewrote the README. Checked from a clean clone: all four views render with no exceptions.

### First CUDA experiments (`cuda-matmul`)

A naive CUDA matrix-multiplication kernel timed against a single-threaded C++ loop on 1024 x 1024 matrices.

- 2025 · not on the site · tags: swe · on no resume
- https://github.com/happyc0der/cuda-matmul-cpu-vs-gpu
- stack: CUDA, C++, Make
- My first CUDA programs (March 2025): a hello-world kernel, then a naive matrix multiply with one thread per output element, checked element by element against a CPU triple loop on 1024 x 1024 matrices.
- The README explains what the host-side timing includes (allocation, copies and CUDA context creation) and lists the next steps: shared-memory tiling, cuBLAS and CUDA events.

Learning exercises, not an optimized GEMM: there is no tiling, cuBLAS or error checking. Kept in the dataset, off the site.

### Snakes and Ladders (JavaFX) (`snakes-ladders-java`)

Two-player Snakes and Ladders desktop game in Java and JavaFX, an IIIT Delhi Advanced Programming team project.

- 2021 · not on the site · team of 2 · tags: swe · on no resume
- https://github.com/happyc0der/snakes-and-ladders-java
- credit: Built with Vedant (oo7vedant-IIITD on GitHub) for Advanced Programming at IIIT Delhi in 2021; I worked on the UI and we bug-tested it together. The repository is a fork of his SnakeScape. My 2026 commits add a Maven build, fix resource loading so it runs from a fresh clone, fix two UI bugs and rewrite the README with screenshots.
- stack: Java, JavaFX, FXML, Maven
- Splash screen, animated menus, a dice, pieces that walk the board tile by tile, 10 snakes and 10 ladders, and a win screen with replay.

A 2021 course project that cloned the Snake & Ladder mode of the Ludo Master mobile app. Kept in the dataset, off the site.

### The Farmer Was Replaced: Fastest Reset (`tfwr-speedrun`)

A script that plays the programming game The Farmer Was Replaced from an empty 1x1 farm to the Leaderboard unlock: 44:39.8 on Steam's Fastest Reset board, rank 39 of 4,409 on 2026-11-04.

- 2026 · code not public · tags: swe · on no resume
- stack: Python, The Farmer Was Replaced
- stats: 44:39.8 Fastest Reset · rank 39 of 4,409 on 2026-11-04 · 63:16 to 44:23 in sandbox
- One script plays the whole Fastest Reset category: a single drone on a 1x1 farm builds up hay, wood, carrots, sunflower power and pumpkins, then mazes, cactus and dinosaurs, ending on a 16x16 farm with 16 drones, until 1,000,000 gold and 2,000,000 bones buy the Leaderboard unlock.
- Timed each change in the game's own simulate() sandbox, which starts from the same state as a Fastest Reset run, with unlock costs and grow times measured by in-game get_cost() and timing probes.
- Cut the time from 63:16 for the first working version to a 44:23 average on three sandbox seeds; the last steps were watering new plants and a leaner dinosaur loop (409 to 384 s). Steam score 44:39.8, rank 39 of 4,409 on 2026-11-04.

The Farmer Was Replaced is a farming game you play by programming a drone in a Python-like language. Its Fastest Reset leaderboard times a program from a fresh start, an empty 1x1 farm and one drone, to the Leaderboard unlock, which costs 1,000,000 gold and 2,000,000 bones. The script is one file. A single drone farms hay, wood and carrots, buys speed and a bigger farm, and powers itself with sunflowers; pumpkins then make the weird substance for mazes, whose gold buys more drones; the endgame runs 16 drones on a 16x16 farm, sorting cactus, playing the dinosaur for bones and solving mazes for gold.

Each change was timed in the game's own simulate() sandbox, which starts from the same state as a Fastest Reset run. Unlock costs and grow times were measured with in-game get_cost() and timing probes. Runs are deterministic per seed, but a small code change can shift a run by 30 to 50 s either way, so versions were mostly compared on two or three seeds and only large effects were kept. The first working version took 63:16; the current one averages 44:23 on three seeds, after watering new plants and a leaner dinosaur loop that took that phase from 409 to 384 s. The Steam score comes from the game's own leaderboard_run(), which repeats the run on new seeds for at least two hours of game time and scores the average: 44:39.8, rank 39 of 4,409 on 2026-11-04. Polyculture first, more drones earlier and a 22x22 farm all came out break-even or slower, so going under 30 minutes needs a different idea, most likely in the opening. The code is not public.

### minecraft-modpack-tools (`minecraft-modpack-tools`)

Python command-line tool for the jobs big Minecraft modpacks leave you to do by hand: HD texture packs, texture crashes, purple/black items, moving a player to another UUID and finding a world's newest copy.

- 2026 · tags: swe · on no resume
- https://github.com/happyc0der/minecraft-modpack-tools
- stack: Python, NumPy, SciPy, Pillow, xBRZ, uv, pytest
- stats: 7 subcommands · Minecraft 1.4.7 to 26.2 · 28 test functions
- One command, mcpack, with 7 subcommands: upscale, animated, atlas-fit, item-atlas, player-transfer, worlds and xbrz. Together they were run on real packs and worlds (Minecraft 1.4.7 to 26.2) before being cleaned up for release, and none needs the game to be running.
- The texture commands follow eight written rules, each added after it went wrong in a real pack: animation strips scale frame by frame, tiling textures stay seamless, cut-outs stay cut-out, leaves keep their noise, and transparent pixels get bled color so mipmaps don't draw halos.
- player-transfer moves a player's inventory, stats, advancements and the UUID references in mod data and chunks to another UUID. It edits NBT only if it round-trips byte for byte, backs up each file before changing it, and has a dry run that lists each changed file.

Big Minecraft modpacks leave a lot of jobs to the player, so `mcpack` has a subcommand for each. `upscale` fills in every mod texture an HD pack lacks, `animated` rebuilds animated textures frame by frame, `atlas-fit` fixes the `StitcherException: Unable to fit` start-up crash by shrinking oversized textures, and `item-atlas` finds and fixes the purple/black items resource packs show on 26.x. `player-transfer` moves a player's data to another UUID, and `worlds` finds every copy of every world in folders and backup zips, matched by the seed and name in level.dat. `xbrz` builds the optional xBRZ scaler from pinned, hash-checked source; without it the texture commands use a built-in Scale2x. The tools ship no game assets or pack art.

The eight texture rules are written down with the reason for each. `item-atlas --check` simulates how the game bakes every item and block model and reports the failures the game would log; on two real packs its lists matched the client log exactly. `player-transfer` recognizes UUIDs in five encodings across player files, mod data and chunks, backs up each file before its first change and never deletes the source's files. The 28 test functions build small synthetic packs, jars and worlds, so they need no game files, and CI runs them on Ubuntu and Windows with Python 3.10 and 3.13.

The tool is Apache-2.0.

### panau-completionist (`panau-completionist`)

Windows tools for getting Just Cause 2 (Steam, PC) to 100%: a best-of-both save merge, a real-time arrow overlay to every remaining collectible and sabotage target, a save audit and a 16-byte crash fix. Single-player only.

- 2026 · tags: swe · on no resume
- https://github.com/happyc0der/panau-completionist
- stack: Python, ctypes, Win32 API, tkinter, x86 disassembly, unittest, uv
- stats: 2,524 collectibles · 3,568 sabotage targets · 16-byte crash patch
- The merge combines two saves, taking every collectible, destroyed object, settlement, race, black market unlock and stat either one has, then recounts the tallies the game keeps but never recomputes. A read-only audit checks that a save holds the best of other saves.
- The overlay reads loaded objective markers and pickups from memory 5 times a second, plus the in-memory progress table and newest save for anything farther away, and draws arrows to whichever of 2,524 collectibles (white) and 3,568 sabotage targets (red) remain in range.
- The overlay, the optional cheats (infinite health and ammo) and the wingsuit mod installer unlock once the newest save shows the story finished on Hardcore, or by setting panau config unlock always.

A set of Python tools (version 1.4.0, Python 3.10+, no other dependencies) for finishing Just Cause 2 on Steam. It is Windows only and for single-player use. A `panau` command merges two saves, audits the result, runs the overlay and cheats, installs or removes a wingsuit mod from a zip you download (the mods are other people's work and are not included), and applies the crash fix. A Steam launch option starts the overlay and cheats with the game once they are unlocked. Faction items such as skulls and black boxes get no arrows, since the game's own map already shows them.

A save is a stream of sections plus a section table at 0x200 that the game uses to find each one. The merge rebuilds that table whenever a section changes size, because a stale table makes the game silently reset parts of the save, and a save that does not round-trip byte for byte is refused. Progress is a 23,833-slot hash table of (type, object) keys with one bit each; the bit means something different per type, so a data file records which value means done. An edited save is tested by the game's own next autosave, written right after loading, where any rejected change shows up. Missions and faction progress stay the base save's by default. Nothing is injected into the game: apart from the cheats' two values the tools only read its memory, and the overlay and cheats refuse a build whose code does not match known bytes. The crash fix rewrites a 10-byte getter using the 6 bytes of padding after it, and Steam's file verification undoes it. The repo has 8 unit tests, 2 of which need real save files.

### Portfolio Pulse (`portfolio-pulse`)

Portfolio monitoring for venture funds, built at NYC's Deal Flow VC hackathon: fixed rules turn akta.pro news into ranked signals, and code drops any drafted fact without a citation.

- 2026 · Hackathon entry, did not win · tags: swe ml data · on no resume
- https://github.com/happyc0der/portfolio-pulse-app
- live: https://portfolio-pulse-portfolio-mo-193e.ninoo.app
- credit: Team entry with Utkarsh Mittal.
- stack: Python, FastAPI, React, TypeScript, Vite, Tailwind, Claude Opus 5.5, akta.pro, PRISM, Roundtable, Ninoo Builder, pytest
- stats: 142 companies, 358 signals · About 45 s to add a fund · 75 backend tests
- Team entry for Track 3 (Portfolio) of Deal Flow, NYC's first VC hackathon, at Betaworks on 2026-10-24: pulls 90 days of akta.pro news for each portfolio company and maps event tags to a category, a severity from 1 to 3 and a suggested move with fixed rules, so the model never decides severity.
- Ranks companies by a pulse score (severity summed with a 90-day half-life) and lists recent severity 3 signals under "Needs your attention"; at 2:51 PM ET on the day the live app held 142 companies across four funds, 358 signals and 7 items needing attention, and a fund added by name had news in about 45 seconds.
- Claude Opus 5.5 drafts partner notes, founder emails and LP updates from numbered sources, and a validator drops any fact with no citation or a citation to a source the model was not given; nothing sends itself. 75 backend tests pass, and three QA agents tested the live app as a user, as a skeptical VC and on funds added live.

Portfolio Pulse is a team entry for Track 3 (Portfolio) of Deal Flow, NYC's first VC hackathon, held at Betaworks on 2026-10-24. A fund's companies are in the news every week, but nobody reads all of it, and once a quarter someone rebuilds the story by hand for the LP letter. Pick a fund and the app pulls the last 90 days of akta.pro news for each company, turns every article into a signal and shows what needs a partner's attention today.

The signals come from fixed rules, not a model. akta.pro's event tags map to a category (Funding, People, Product, Corporate, Risk), a severity from 1 to 3 and a suggested move, and headcount data adds leading indicators for a six-month drop of 5% or more or growth of 20% or more. A news story reaches severity 3 only if it is reported news that names the company in the headline, and repeat reports of one story within seven days merge into one signal. Companies are ranked by a pulse score, the sum of severity halving every 90 days, and "Needs your attention" lists severity 3 signals from the last 30 days at companies that have not exited.

Claude Opus 5.5, called through Nicrron, drafts a three-bullet partner note, a short founder email or a quarterly LP update from numbered sources. Before anything reaches the screen, a validator drops any fact with no citation and any citation to a source the model was not given, and keeps questions and offers to the founder. PRISM records one trace per draft and LP update, and Roundtable carries the handoff between the agent that watches signals and the one that files drafts. Nothing sends itself: every output is a draft for a person to read, edit and send.

At 2:51 PM ET on the day, the live app held 142 companies across four funds, 86 of them with news, 358 signals from the last 90 days and 7 items in "Needs your attention". A fund added by name went from the search box to a fund page with news in about 45 seconds (25 companies of 485 on record). 75 backend tests pass, and three QA agents tested the live app as a user, as a skeptical VC and on funds added live; their findings drove the final triage and reliability fixes. Portfolio Pulse did not win at Deal Flow. The judge said the project was good and that it reports signals but does not help manage the fund, so positions, marks and fund metrics are next on the [roadmap](https://github.com/happyc0der/portfolio-pulse-app/issues/1). The write-up is on [Devpost](https://devpost.com/software/portfolio-pulse-zufqo1) and the demo video is on [YouTube](https://www.youtube.com/watch?v=wEgW44s1ndU).

### Paper 26.2 plugin ports (`paper-plugin-ports`)

Other people's Minecraft server plugins ported to Paper 26.2 to run a modded server for friends, plus 9 bug-fix pull requests sent upstream from 8 public forks; 5 have landed.

- 2026 · tags: swe · on no resume
- https://github.com/happyc0der/ProjectKorra/tree/fix/griefdefender-event-api
- credit: These are other people's plugins, and the credit for them is theirs: ProjectKorra; elBukkit (Magic); TheBusyBiscuit and the Slimefun contributors (Slimefun, maintained as Slimefun Legacy by wickidcow); SchnTgaiSpock (SlimeHUD, maintained as SF_SlimeHUD by wickidcow); VoperAD (SlimeFrame); Slimefun-Addon-Community (SlimeChem) and poma123 (GlobalWarming), both maintained by SlimefunNewHorizons, which also keeps SoundMuffler-drake and ExcellentEnchants-Drake; J3fftw1 (SoundMuffler); nulli0n (ExcellentEnchants); haiman233 and hershate (WorldTaste, maintained as WorldTaste-Plugin by ykcgly). My part is the ports and the fixes.
- stack: Java, Maven, Paper API, packetevents, Python
- stats: 111 plugins booted on staging · 9 upstream PRs from 8 public forks · 5 landed, 4 open
- Got the plugin set of a modded server for friends running on Paper 26.2: staging booted 111 plugins on 2026-10-08, counting drop-in builds that needed no changes. These are other people's plugins; I ported and fixed them.
- Rewrote SoundMuffler's ProtocolLib PacketAdapter as a packetevents listener, added a spigot-26.2 NMS module to ExcellentEnchants, and scripted import and pom rewrites for addons built against a different Slimefun fork and enum renames for older addons. That source is not in a public repo.
- Sent 9 bug-fix pull requests upstream from 8 public forks: 3 merged, 2 landed through the maintainer's own follow-up PRs with tests and credit, 4 open as of 2026-11-04. They include Magic's Skript 2.10+ integration and a NullPointerException in ProjectKorra's canBend.

These are other people's plugins, not mine. A modded server for friends needed them on Paper 26.2, and many had no build for it, so I ported what I could from source and tried everything on a staging server first. On 2026-10-08 staging booted 111 plugins, counting drop-in builds that needed no changes. ProjectKorra built from upstream's `wip` branch, which already had the API update, with two pom changes: excluding a dead dependency and moving the API target to 26.2. ExcellentEnchants got a new `spigot-26.2` NMS module; the one API change was a replaced `CraftEnchantment` method. SoundMuffler's ProtocolLib `PacketAdapter` became a packetevents listener, and its block scan on every packet became a registry filled by the machine's ticker. Addons written against SlimefunNewHorizons' hard fork of Slimefun went through scripts that rewrite imports and poms to target Slimefun Legacy, and older addons through a script that renames old enum constants. Apart from the dependency fix below, this port source is not in a public repo.

What is public is the bugs I found along the way and sent back. Each fork has one fix branch with one commit on top of upstream (ProjectKorra has two), and its default branch matches or trails upstream, so the links below go to the branches. Each fork keeps its upstream's license. Merged: [MagicPlugin](https://github.com/happyc0der/MagicPlugin/tree/fix/skript-2.10-event-values) (elBukkit, MIT, [#1528](https://github.com/elBukkit/MagicPlugin/pull/1528)), a Skript 2.10+ integration that threw `NoSuchMethodError`; [SlimeChem-drake](https://github.com/happyc0der/SlimeChem-drake/tree/fix/molecule-recipes) (SlimefunNewHorizons, LGPL-3.0, [#1](https://github.com/SlimefunNewHorizons/SlimeChem-drake/pull/1)), molecule recipes that skipped ingredients after a stack over 64; [GlobalWarming](https://github.com/happyc0der/GlobalWarming/tree/fix/animal-breed-pollution) (SlimefunNewHorizons, MIT, [#1](https://github.com/SlimefunNewHorizons/GlobalWarming/pull/1)), animal breeding that lowered pollution instead of raising it. Landed through the maintainer's own follow-up PRs, which added tests and credited me: [Slimefun-Legacy](https://github.com/happyc0der/Slimefun-Legacy/tree/fix/silent-locked-mob-drops) (wickidcow, GPL-3.0, [#524](https://github.com/wickidcow/Slimefun-Legacy/pull/524), landed through [#555](https://github.com/wickidcow/Slimefun-Legacy/pull/555)), a chat line per locked drop on every mob kill; [SF_SlimeHUD](https://github.com/happyc0der/SF_SlimeHUD/tree/fix/held-tool-family) (wickidcow, GPL-3.0, [#15](https://github.com/wickidcow/SF_SlimeHUD/pull/15), landed through [#16](https://github.com/wickidcow/SF_SlimeHUD/pull/16)), a held-tool hint that showed for any item. Open as of 2026-11-04: [ProjectKorra](https://github.com/happyc0der/ProjectKorra/tree/fix/canbend-null-ability) (ProjectKorra, LGPL-2.1, [#1441](https://github.com/ProjectKorra/ProjectKorra/pull/1441)), a NullPointerException in `BendingPlayer.canBend`, and [its build fix](https://github.com/happyc0der/ProjectKorra/tree/fix/griefdefender-event-api) ([#1440](https://github.com/ProjectKorra/ProjectKorra/pull/1440)) for the dead dependency; [SlimeFrame](https://github.com/happyc0der/SlimeFrame/tree/fix/relic-inventory-dupe) (VoperAD, GPL-3.0, [#10](https://github.com/VoperAD/SlimeFrame/pull/10)), a relic dupe, drag-in storage and relics lost on a crash; [WorldTaste-Plugin](https://github.com/happyc0der/WorldTaste-Plugin/tree/fix/unnamed-appearance-match) (ykcgly, MIT, [#1](https://github.com/ykcgly/WorldTaste-Plugin/pull/1)), plain vanilla items resolving to another addon's Slimefun item.

## Skills

- languages: Python, C, C++, Kotlin, TypeScript, JavaScript, SQL, Java, R, Bash, eZ80 assembly, Monkey C
- ml: PyTorch, deep learning, scikit-learn, LightGBM, XGBoost, CatBoost, Hugging Face transformers, NumPy, pandas, polars
- data: PySpark, Databricks, SQL, PostgreSQL, SQLite, pandas, Parquet, time-series forecasting, statistics (hypothesis testing, regression), econometrics (fixest), Streamlit, Altair, Matplotlib
- systems: CMake, gRPC, PostgreSQL, SQLite, WebAssembly (sandboxed mods), Android (Jetpack Compose, Room), Next.js, React, FastAPI, Node.js, REST APIs, MCP
- security: applied cryptography, post-quantum cryptography (ML-DSA, ML-KEM), X25519, ChaCha20-Poly1305, HKDF, network security (TLS), OAuth 2.1 (PKCE, JWT), libsodium, liboqs, fuzzing (libFuzzer), mutation testing, ASan/UBSan, formal verification (ProVerif), security auditing and vulnerability assessment, threat modeling
- testing: pytest, Catch2, vitest, Robolectric, libFuzzer, ASan/UBSan, static analysis (clang-tidy, ruff, ESLint), ProVerif, unit and integration tests, CI
- ai: LLM agents (Google ADK, MCP, tool calling), vLLM, Ollama, LiteLLM, LoRA/QLoRA fine-tuning (PEFT), llama.cpp/GGUF quantization
- quant: backtesting (purged walk-forward, CPCV, Deflated Sharpe, PBO), financial modeling, econometrics (fixest, fixed effects, clustered SEs), time-series forecasting, Kalman filters, bandits, Markov chains
- tools: Git, CI/CD (GitHub Actions), Docker, AWS (CDK, App Runner, DynamoDB), Vercel, Linux, WSL2, Tailscale, Claude Code

## Activities

- Open source: ephys-mcp on PyPI and the MCP Registry (24 tools, 52 tests); six fixes to hawk-py
- Treasurer, OWASP Student Chapter, IIIT Delhi
- Events head, Finnexia (finance club), IIIT Delhi; organized "The Critical Bid"
- Attended the first International Quantum Communication Conclave, New Delhi, 2023
