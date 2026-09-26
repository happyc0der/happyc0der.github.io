# Keshav Rajput: master data

Generated from content/ on 2026-09-26. Do not edit; edit the source files and run `npm run master`.

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

- Biohub Cell Tracking, Kaggle (2026): Public leaderboard 0.952. Final ranking pending, competition ends 2026-09-29
- Kaggle Playground S6E9 (2026): Out-of-fold AUC 0.9465 from nested target encodings, a LightGBM, CatBoost and MLP blend and 192 experiments judged by paired DeLong tests. Final ranking pending, ends 2026-09-30
- Gemma 4 Developer Agent, Kaggle (Google DeepMind) (2026): LLM agent entry in Google ADK; local evaluation harness with Docker sandboxes and tool calls, served by vLLM. In progress, ends 2026-12-02
- TrafficFlowBench (2026): Public leaderboard 0.845 against a 0.553 baseline, with LightGBM time-series queue forecasting and an NNLS origin-destination solver. In progress, ends 2026-11-06
- AI x GTM Hackathon (Block Convey), Revenue Intelligence track (2026): Entry is Ledger, a pipeline-review agent that checks every claim against the CRM. Event on 2026-10-17

## Projects (32)

### mldsa-auth (`mldsa-auth`)

Post-quantum mutual authentication and session protocol in C11, with a login daemon on top.

- 2026 · featured · tags: sec swe · resumes: swe sec
- https://github.com/happyc0der/mldsa-auth
- stack: C11, liboqs, libsodium, SQLite, CMake, libFuzzer, ProVerif, GitHub Actions
- stats: 0.45 ms handshake · 192 mutations nightly · 12 fuzz targets
- Post-quantum mutual authentication and session protocol in C11: ML-DSA-65 signatures over a hybrid X25519 and ML-KEM-768 key exchange, HKDF-SHA256, and a padded ChaCha20-Poly1305 record layer.
- 0.45 ms median handshake and 736 MiB/s record sealing on an M4 Pro; 35 tests in debug, ASan and UBSan builds on Linux and macOS, 12 libFuzzer targets and 192 must-kill mutations run nightly in CI.
- Built mldsa-authd on it, a login daemon with single-use login codes, device enrolment, revocation, key rotation and recovery codes, and a ProVerif model of the handshake, login and rotation.

Two parties prove who they are with ML-DSA-65 (FIPS 204) signatures, agree a key from X25519 and ML-KEM-768 together, then talk over a padded ChaCha20-Poly1305 record layer. The specification lives beside the code and every design decision is written down in a decision log. Dependencies are pinned by hash or commit and built from source, so a clean checkout builds identical bits.

`mldsa-authd` turns the protocol into a login system. A device authenticates with the handshake and gets a single-use login code, which the site exchanges over a local Unix socket for an opaque session token, so the token never reaches browser JavaScript. Devices can be enrolled, revoked and rotate their keys, a lost device is replaced with a recovery code, and browsers reach the daemon as a WebSocket behind a TLS proxy that states the client address in a PROXY v2 preamble the daemon rate-limits on. It is installable but not deployed: the runbook from an empty VPS to a first login exists, and nobody has run it against a real host yet.

I do not trust a test I have not seen fail. Every push runs the 35-test suite in debug, ASan and UBSan builds on Linux and macOS. Every night, 192 must-kill mutations across 23 campaigns run against a fresh ASan tree, each of the 12 fuzz targets runs for 600 s, and a ProVerif model must prove mutual agreement, session-key secrecy, login-code secrecy and rotation binding while eight derived variants are checked too: three that leak one secret must still prove, and five that remove a check must fail. Each CI gate was shown to go red by breaking it on purpose before it was trusted.

Measured, not estimated: 0.45 ms median hybrid handshake in process on an Apple M4 Pro against a 15 ms target, 0.78 to 1.02 ms on GitHub's shared x86_64 runners, and 736 MiB/s record sealing at 64 KiB. The README says plainly that it is not production-ready: trust is manual key pinning with no CA, and the library is single-threaded by design.

### Atlas (`atlas-engine`)

C++23 engine for map-based strategy games with a deterministic lockstep simulation and sandboxed WebAssembly mods.

- 2026 · in progress · featured · tags: swe · resumes: swe
- https://github.com/happyc0der/atlas-engine
- stack: C++23, SDL_GPU, HLSL, WebAssembly, ENet, CMake, vcpkg, Catch2
- stats: 1045 tests · 1M-cell tick in 694 us · 25 milestones, 21 ADRs
- Solo C++23 engine for map-based strategy games, built in 25 gated milestones: SDL_GPU renderer, asset pipeline with hot reload, versioned scene serialization, audio, animation, and 21 architecture decision records.
- Deterministic fixed-tick simulation with canonical state hashing, replay, save and load, and lockstep play over ENet sockets proved hash for hash between two processes; a million-cell tick runs in 694 us on four workers.
- Mods run as untrusted WebAssembly with no clock, filesystem or random generator; 1045 tests, and CI on macOS, Linux and Windows with ASan and TSan lanes, clang-tidy, a software-GPU lane and benchmarks gated at 1.25x of a recorded baseline.

Atlas is an engine, not a game: it has no countries, wars, diplomacy or rules, and is not meant to. I built it alone in gated milestones, M0 through M24, each ending with a clean configure, build, test run and a runnable demonstration. Every decision that is expensive to reverse is an ADR, 21 so far, and recent milestones each end with a report of what changed, what was run and what is still risky.

The simulation advances in whole integer ticks and hashes its state, so a replay, a save or a second machine in lockstep can be checked bit for bit. Lockstep runs over the command queue: M14 proved it with several simulations in one process agreeing hash for hash, M17 with two processes over a real ENet socket at a 22.4 us median round trip. A million-cell tick takes 694 us on four workers against 1.650 ms without the pool; what remains is serial, and the hash is 0.38 ms of it. Mods are WebAssembly modules that reach simulation state only by submitting commands, with no clock, no filesystem and no random generator of their own.

Three applications drive it. `atlas_sandbox` demonstrates the lifecycle and scene layer. `atlas_lab` is a synthetic million-cell grid with map modes, picking, time controls and replay, there to test the architecture rather than to be a game. `atlas_chess` is the first game on the engine: every rule including the draws, perft-verified, with the Opera Game as a golden hash, playable by two people at one screen or over a socket, and no line of it in `engine/`.

Not done: the renderer is verified on one Apple GPU and one software rasteriser, so Direct3D 12 and non-Apple hardware are untested. Networking is direct address only, with no encryption, NAT traversal or lobby. No large mod has been written, so what loading a real one costs is unmeasured. Everything deferred is listed with its reason in `docs/DEFERRED.md`.

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

On the calculator the limit is painted area, not instruction count. I measured one byte written to VRAM at about 122 cycles, which puts a hard ceiling of about 6.2 fps on a full 320 by 200 view, and on the eZ80 a multiply, shift, and or xor on a 24-bit int compiles to a function call. So the work was Bresenham stepping instead of fixed point, pointer walks instead of 2D indexing, lookup tables instead of multiplies, and an assembly loop for the column fill. A host build compiles the same `main.c` against stub headers, so the renderer can be profiled and played under SDL2 on a laptop.

The watch has the opposite shape. Its own micro-benchmarks showed that a bitmap draw costs about 0.2 ms whatever its size, a rectangle fill about 0.12 ms, bitmap draws are hardware-scaled, and one interpreted loop iteration is about 24 µs, so the renderer had to minimise calls rather than pixels. Each wall face is one `drawScaledBitmap` of a 1 by 32 texture column, sprites are prebuilt palette bitmaps shaded with `setPalette`, adjacent floor fills are merged, the wall pass is cached offscreen once the view holds still, and the game logic runs while the GPU is still drawing the walls. Startup is split into about 140 small tasks so the watchdog does not kill it.

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

I read all 45 source files and probed a local server that had no API keys. The high-severity findings: the Strava and Google OAuth callbacks accepted any authorization code, a Supabase policy let anyone holding the public anon key read every user's trips, a visitor's Strava app secret was stored in a browser cookie in plaintext, and the endpoints that spend money had no rate limit. Each of those fixes was verified: a forged callback is rejected, the anon key reads no rows, the cookie holds ciphertext, and the 11th request in a minute gets a 429. The worst bug for users turned up after the audit: the server's UTC date survived hydration as the date input's minimum, so the trip form would not submit every evening in the Americas.

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

Household inventory that watches CPSC, NHTSA and FDA recalls, served as an MCP server with its own OAuth 2.1 server for Alexa+ and Claude.

- 2026 · featured · tags: swe sec · resumes: sec
- https://github.com/happyc0der/custodian
- stack: TypeScript, MCP, OAuth 2.1, Express, Preact, AWS CDK, DynamoDB, Bedrock
- stats: 10 MCP tools · 79 tests · p95 under 100 ms
- Self-hosted MCP server plus MCP App that checks a household inventory against the CPSC, NHTSA and openFDA recall feeds and tracks home maintenance: 10 tools, 5 screen views, and a deterministic matcher that writes a reason for every match; built for the Alexa+ track of Amazon Build, Ship, Shape 2026.
- Wrote the two-tier OAuth 2.1 authorization server by hand to fit the Alexa+ account-linking shape: client_credentials for service calls, authorization_code with PKCE S256 for household calls, ES256 JWTs, single-use codes, rotating 180-day refresh tokens and scope gating per JSON-RPC method, all covered end to end by tests.
- Kept every tool call inside the 500 ms Alexa+ voice budget by moving all network and model calls into an hourly sweeper (tests assert p95 under 100 ms per tool through the real HTTP stack), in a TypeScript monorepo with file and single-table DynamoDB stores under one contract suite, 79 vitest tests on recorded feed fixtures, and a CDK stack synthesised in CI.

You tell it what you own, a car seat, the minivan, the smoke detectors. It keeps checking the public CPSC, NHTSA and openFDA recall feeds, tracks the small things that keep a home safe (smoke-detector batteries, filters, car-seat expiry, vehicle service, warranties), and answers in one or two spoken sentences with the remedy included. It runs as a self-hosted MCP server over Streamable HTTP, so it works from Claude, an Echo Show running Alexa+, or a script, and it ships a Preact MCP App that draws recall cards, a recall detail page, the household briefing, the maintenance timeline and the inventory when the host has a screen.

Matching is deterministic and every match carries a written reason. Candidates come from a MiniSearch index over titles, products and keywords; brand, model and distinctive-word overlap are weighted, a score of 0.5 records a match and 0.8 is spoken as definite. Keywords come from the record body rather than the title, because the CPSC feed has a record whose title belongs to a different recall, which the tests now pin with a recorded fixture. When Claude on Bedrock is enabled it adjudicates only the 0.5 to 0.8 band, and the verdict is cached on the match so it is never re-asked.

Alexa+ allows 500 ms per tool call, so no tool handler does network I/O or calls a model. All of that runs in a sweeper, hourly and right after add_item returns. The OAuth 2.1 authorization server is my own because voice assistants need a two-tier shape (client credentials for service calls, PKCE for household calls, no dynamic client registration, no WWW-Authenticate challenge) that generic MCP auth libraries do not produce.

I built it in September 2026 (the commits run from 2026-09-12 to 2026-09-23) for the Alexa+ track of Amazon Build, Ship, Shape 2026. The add-on itself was not submitted: the Alexa CLI is distributed through a private AWS CodeArtifact repository that needs an AWS account, which I do not have, so the repo stands as a portfolio piece. What I learned about the toolkit and the feeds is in docs/platform-notes.md. The screenshots were rendered with the reference MCP Apps basic-host against live recall data.

### Gemma 4 SWE agent (`gemma-swe-agent`)

Solo Kaggle SWE-agent entry, in progress, built on a re-implementation of the organizers' unreleased evaluation harness.

- 2026 · in progress · featured · tags: ml swe · resumes: ml
- https://github.com/happyc0der/gemma-swe-agent
- stack: Python, Google ADK, vLLM, LiteLLM, Docker, Gemma 4, Tailscale, Kaggle API
- stats: 109/129 gold checks · 7/33 proxy holdout · $0 cloud spend
- Kaggle Gemma 4 Developer Agent competition (solo, in progress): a declarative Google ADK agent that fixes GitHub issues with Gemma 4 31B, submitted daily; two submissions so far, both 0.00 on the public leaderboard, final ranking pending.
- swelite, a re-implementation of the organizers' unreleased evaluation harness (Docker sandboxes, the 9 fixed tools, ADK YAML compiler with skills, multi-pass patch verification, failure-taxonomy analyzer), validated with gold and null checks on all 129 public tasks: 109 pass, 0 pass unfixed.
- Provisioned a 16 GB laptop GPU over SSH as a vLLM proxy box and ran 33-task holdouts per prompt change (best 7/33); found that ADK never compacts context inside a task and that temperature 0.7 cut identical retries from 13.5 to 5.1 per task.

The competition asks for a declarative Google ADK agent config (YAML, prompts, skills, optional LoRA adapters) that turns `gemma-4-31b-it-qat-w4a16-ct` into an agent that fixes real GitHub issues offline. Scoring runs on about 120 hidden tasks from private repos on 4x L4 GPUs, with 12 hours for the whole set and one submission a day. I entered solo with a $0 cloud budget, Kaggle's free GPU hours only.

The organizers' evaluator is unreleased, so I re-implemented it from their spec as `swelite`: Docker and subprocess sandboxes, the 9 tools with the same JSON contracts and truncation caps, a sandboxed YAML compiler with include directives and ADK skills, the nudge loop, multi-pass patch verification and an analyzer that sorts failures into buckets. Gold and null checks on all 129 public tasks give 109 pass and 0 pass unfixed (2 on the native x86_64 box); the 20 residual gold failures are environment differences, listed per repo in `docs/harness-fidelity.md`.

The 31B model's roughly 17 GB of weights do not fit my laptop's 16 GB GPU, so that laptop serves Gemma 4 12B through vLLM 0.30 as a proxy. I set it up over SSH and Tailscale: WSL2, Docker, vLLM fitted into 16 GB, and Task Scheduler for jobs that survive SSH logoff. Runs are logged under `experiments/` with a config snapshot, per-task results and notes.

Two findings drove the prompt. ADK's context compaction never fires inside a task, so trajectories die at the 32k window after about 20 full-size tool outputs. Temperature 0.2 makes the model retry failed calls verbatim; 0.7 cut identical repeats from 13.5 to 5.1 per task. The holdout went from 6/33 to 7/33 with a prompt written around a context budget. Two Kaggle submissions so far, both 0.00 on the public leaderboard, while the same config solved 6/33 on the proxy; the next submission tests a shorter per-task budget against the 12 hour global cap. The competition closes 2026-12-02; final ranking pending.

### Biohub cell tracking (`biohub-cell-tracking`)

Kaggle cell-tracking competition entry on free GPU, public leaderboard 0.952 from an offline post-processing harness and a 3D CNN that prunes false cell divisions, final ranking pending.

- 2026 · in progress · tags: ml data · resumes: ml data
- credit: The submission is a fork of Igor Zharov's public Harmonic Fusion notebook (Apache-2.0). The offline harness, the division classifiers and every experiment are mine.
- stack: Python, PyTorch, NumPy, SciPy, polars, scikit-learn, uv, Kaggle API
- stats: public LB 0.952 · +0.005 measured twice · ~22 Kaggle GPU-hours
- Kaggle Biohub Cell Tracking During Development (September 2026): public leaderboard 0.952 against 0.947 for the unmodified public notebook it builds on, using only free Kaggle GPU; final ranking pending.
- Built an offline harness that runs GPU inference on Kaggle once, then re-runs the notebook's post-processor locally against the hosts' official scorer on 40 held-out videos, five times the upstream validator, and matches the notebook's own score to +0.00011.
- Trained a small 3D CNN on 134 annotated cell divisions to prune false division forks: predicted +0.0047 on a pre-registered holdout, measured +0.005 on the leaderboard twice, while nine other ideas were tried and rejected.

This is a code competition with a 12-hour notebook cap, and I had only the free Kaggle GPU quota. The strongest public notebook, Harmonic Fusion, scores 0.947 and tunes its post-processing inside the notebook on 8 videos with 7 candidate configurations, because inference eats the budget. Inference needs the GPU; post-processing does not. I forked the notebook, ran inference once over 40 held-out training videos, exported the raw prediction graphs and ground truth, and pulled the post-processor out of the notebook with an AST extractor so it runs on my laptop against the hosts' official scorer. Before trusting anything downstream I checked the port against the notebook's own output: score delta +0.00011, median node shift 0.0000 µm against a 7 µm matching tolerance.

Every offline number is a selection set of 26 videos against a holdout of 14, balanced by embryo and split before any experiment. Most ideas died there. A 358-evaluation coordinate descent over 20 post-processing knobs gained +0.016 on the selection set and lost 0.010 on the holdout. Turning off the DeepCenter veto, loosening the division gates, and rewiring daughters to a different parent on geometric rules all failed too: in 29 of 60 annotated divisions the true parent sits about five times farther from its daughter than a competing node, so no local rule recovers them. One flag that gained +0.0045 on the holdout lost 0.002 on the leaderboard; a holdout with 17 division events cannot separate +0.004 from zero, and the log says so.

The one change that survived is a small 3D CNN, trained on 134 real cell divisions, that scores every node and prunes division forks it judges false. On the holdout it cut division false positives from 6 to 3 without losing a true positive, gave the identical result at every threshold from 0.10 to 0.30, and cleared a random-score floor I had measured first. It predicted +0.0047; the leaderboard gave +0.005 twice, 0.945 to 0.950 and 0.947 to 0.952. The shipped version averages two such classifiers. The whole result cost about 22 of a 30-hour weekly GPU quota, each run logged with its cost.

The competition closes on 2026-09-29 and the final ranking is pending, so this page carries only the public score. The code is private for now, under GPL-3.0, with the full experiment log, the GPU ledger and a step-by-step reproduction in the repository.

### TrafficFlowBench (`trafficflowbench`)

Kaggle freeway traffic benchmark, public leaderboard 0.845 against a 0.5534 baseline, final ranking pending.

- 2026 · in progress · tags: ml data · resumes: data
- https://github.com/happyc0der/trafficflowbench
- stack: Python, LightGBM, scikit-learn, NumPy, SciPy, polars, pandas, Kaggle API
- stats: public LB 0.845 · onset IoU 0.57 to 0.93 · 2 h bit-for-bit repro
- Kaggle TrafficFlowBench (2026 IEEE Big Data Cup): public leaderboard 0.84481 against the organizers' 0.5534 baseline, up from 0.67365 on my first submission, final ranking pending.
- Four-task pipeline: same-link time interpolation for missing detector cells, LightGBM queue forecasters trained out of core on 56M rows from 273 train days with causal features, and an exact-fit NNLS origin-destination solver.
- Found a window-selection regularity in the queue-onset task that lifted onset IoU from 0.57 to 0.93 and reported it on the competition forum; the hosts confirmed it and announced it to all teams.

TrafficFlowBench is the 2026 IEEE Big Data Cup competition on Kaggle: ten freeway corridors at five-minute resolution and four scored tasks on the same data. Fill the missing detector cells, say which links are queued over the next thirty minutes, keep the reconstruction consistent with traffic-flow physics, and estimate an origin-destination matrix. The score weights them 0.35, 0.30, 0.15 and 0.20. The public leaderboard scores one month and a separately generated month decides the final ranking, so I validate on the 273 train days and use the leaderboard only as a transfer check.

My first submission, same-link time interpolation for the state plus the organizers' baselines for queues and OD demand, scored 0.67365. Most of the gain since then came from Task 2: LightGBM models per window type, trained out of core on 56M rows generated from every train day, with features restricted to timestamps at or before the forecast origin, and a unit test on the day-context features that overwriting later slots leaves them unchanged. For Task 4 I solve the OD matrix on each split's own link counts rather than the train counts the organizer script used, since the released counts are noise-free and an unregularised NNLS fits them exactly.

Checking the shipped queue-onset train windows, I found that in 39 of 40 the first queued cell appears exactly at T+30, a side effect of how the organizers pick window origins. A model trained only on windows built the same way lifted onset IoU from 0.57 to 0.93 on held-out dates. I wrote it up on the competition forum, said plainly that my submission already used it, and offered to switch back. The hosts confirmed the regularity, said it could be used, and announced it to every team.

reproduce.sh rebuilds the submitted file bit-for-bit from the raw data in about two hours on my Mac, since the rules require winners to reproduce their file from code. Probes of the Task 4 deviation form lost on the leaderboard, ramp-demand features and a 1-D CNN second opinion for ongoing queues lost in local validation, and all are logged as rejected in NOTES.md.

### Kaggle S6E9, EV purchases (`kaggle-s6e9`)

Kaggle Playground S6E9, public leaderboard 0.94649 against a leader at 0.94674, with a 192-experiment ledger and a label-noise ceiling analysis, final ranking pending.

- 2026 · tags: ml data · resumes: ml data quant
- https://github.com/happyc0der/kaggle-s6e9-ev-purchases
- stack: Python, LightGBM, XGBoost, CatBoost, PyTorch, scikit-learn, SciPy, Kaggle API
- stats: public LB 0.94649 · 192 experiments · 669k rows
- Kaggle Playground S6E9 (EV purchases, ROC AUC): out-of-fold AUC 0.94648, public leaderboard 0.94649 (hedge entry) and 0.94642 (best validated entry) against a leader at 0.94674, final ranking pending.
- Nested target encodings over the synthetic generator's artifacts on 668,665 rows, 20 folds with encoding-seed bags, and a logit blend of LightGBM, CatBoost and a 15-seed MLP with hard-edge post-processing.
- Logged 192 experiments judged by paired DeLong tests (accept at +0.00008 with z ≥ 3, noise floor about 0.00003), and showed by label resampling that a perfect model would score 0.9459 ± 0.0003, so the remaining gap is label noise.

Kaggle Playground Series S6E9 asks for the probability that a person buys an electric vehicle, scored by ROC AUC. The train set (668,665 rows) and test set (286,571 rows) are synthetic, generated from a 10,000-row original that is itself synthetic: features drawn from a fixed random state, label from a probit formula on income, environmental concern, subsidy and range anxiety. Nearly every point of AUC above about 0.942 comes from the generator's artifacts. A few thousand income and commute values are heavily over-produced, and the label rate at those values departs from the formula. So I modelled how the data was made rather than what it represents.

LightGBM on the 13 raw columns scores 0.9419 out of fold. Per-value frequency, lift against the original and novelty features take it to 0.9436, nested target encodings of income and commute at several bin widths to 0.9459, shallow column-subsampled trees with target encodings on every column to 0.9462, and 20 folds with encoding-seed bags and a logit blend of LightGBM, CatBoost and a 15-seed MLP to 0.9464. XGBoost was trained alongside and got zero weight. The last 0.0001 came from hill-climbing blend weights over out-of-fold prediction libraries other competitors had published; they are credited in the repo and not redistributed. The public leaderboard tracked my out-of-fold score within about 0.0001 throughout.

Every idea ran against a fixed reference with a paired DeLong test and went into experiments/results.csv, 192 rows, most of them negative: interaction encodings in every form, similarity to original rows, density windows, digit residues, pseudo-labelling, native categorical handling, deeper or tuned trees, neural-net value embeddings, segment-wise calibration and more, all within ±0.00005 or worse. The accept rule was a paired gain of at least +0.00008 with z ≥ 3, against a noise floor near 0.00003. To see what was left, I resampled labels from the model's own calibrated probabilities: a perfect model scores 0.9459 ± 0.0003 on those, per cell of concern, subsidy and anxiety the real score matches that ceiling within 0.001, and a model trained to predict the blend's errors explains none of them (R² = −0.003). The rest is label noise the generator put there.

The competition closes on 2026-09-30, so the final ranking is pending. The pipeline is public under GPL-3.0 with a rerun playbook, dataset-fact tests, a leak-freeness test for the encodings and a synthetic end-to-end smoke test.

### Blockwave (`blockwave`)

A falling-block game with no asset files, and an RL agent that learns to play without ever seeing the score.

- 2026 · tags: ml swe · resumes: ml
- https://github.com/happyc0der/blockwave
- stack: Python, numpy, pygame-ce, PyTorch, PPO, pytest, ruff, uv
- stats: 465 tests · ~300k engine steps/s · 88x88 pixel agent
- Guideline-style falling-block game in Python and numpy with no image, font or audio file in the repo: SRS rotation with both kick tables, 7-bag, T-spins, a 240 Hz fixed-timestep loop, deterministic replays and a headless engine at about 300k steps per second.
- PPO agent trained on an empowerment reward that never sees score, lines or level, enforced by a static firewall test; the pixel version sees only an 88x88 crop and learns what its keys do from 60,000 blind key-press trials before counting futures through that model.
- 465 tests in about 40 seconds; after two identical 150M-step runs differed by 42%, I withdrew every single-seed comparison from the README and research log and added a compare tool that refuses to print a significance figure for one seed.

The game is written in Python and rendered in numpy. There is no image, font or audio file in the repository: each frame is painted into arrays, the typeface is a procedural bitmap atlas, and the 20 sound effects and 5 music loops are synthesized from oscillators by `blockwave gen-assets`. The rules are the modern guideline set, with SRS rotation and separate kick tables for the I piece and the rest, 7-bag piece selection, hold, a five-piece preview, extended placement lock delay capped at 15 resets, and the three-corner T-spin rule. The engine imports no pygame and takes its timestep as an argument, so the game loop, a replay and a headless script drive it identically, and it runs at about 300k steps per second, which is what makes the 10,000-action fuzz test cheap.

The second package is an agent that is never told the score. Score, lines and level reach only the evaluator, and a static test fails if any other module reads them. The reward is empowerment: how many distinct futures the agent's key presses can still reach. The board-state version counts those futures with the simulator and reaches 0.163 lines per piece after 150M steps, against 0.393 for a scripted heuristic and 0.0018 for a policy that simply never hard-drops. The pixel version sees only an 88x88 crop of the screen at five decisions per second, so it cannot borrow the simulator: it runs 60,000 trials of blind key-press programs, fits a model of what they do, and counts futures through that model. The shipped 50M-step pixel agent clears 0.094 lines per piece and survives about 50 pieces a game, and both packages come with pretrained checkpoints.

A second seed of the 150M pixel configuration scored 0.0647 where the first scored 0.0991, a spread of 42% of their mean and about 19 times the within-run standard error I had been quoting. That made every single-seed comparison between reward variants and compute budgets uninterpretable, so I withdrew them in place in the research log rather than deleting them, and wrote `blockwave_rl.compare`, which groups runs by configuration and refuses to print a significance figure for a single seed. Resolving the effect I had reported would take about 214 seeds per arm at five hours each, so the question is closed as unanswerable at that cost. What survives is the deliverable: both seeds beat the drift baseline by 36x and 55x.

The 465 tests run in about 40 seconds. They check kick-table transcription in both directions, audit board invariants after 10,000 random actions, check audio for clipping, DC offset and clicks at loop seams, render each visual setting on and off and fail if the frame does not change, and assert that two boards differing only in score give byte-identical observations to the agent. Policies that beat the reward are recorded as strict expected failures rather than hidden.

### ephys-mcp (`ephys-mcp`)

MCP server for read-only analysis of spike-level brain-computer-interface recordings.

- 2026 · tags: swe ml · on no resume
- https://github.com/happyc0der/ephys-mcp
- stack: Python, MCP, numpy, scipy, pynwb, spikeinterface, matplotlib, GitHub Actions
- stats: 24 tools, 5 sources · PyPI + MCP Registry · 52 tests, CI
- Python MCP server that lets an LLM analyse intracortical, spike-level brain-computer-interface recordings: 24 read-only tools over synthetic, local NWB, WAV, live Lab Streaming Layer and DANDI Archive sources, released as v0.5.1 on PyPI and the official MCP Registry.
- Covers signal quality, threshold spike detection, firing rates, ridge and Kalman decoders scored on held-out data, trial-aligned PSTHs, geometry-aware spike sorting through spikeinterface, FALCON-style cross-session evaluation and GPFA written from the paper's equations in numpy and scipy, with figures returned inline as PNG.
- Reference results on public data: ridge R² 0.50 for hand velocity on MC_Maze_Small, and on FALCON H1 a decoder that scores 0.43 on its own day and 0.07 one week later; 52 tests, 51 of them run with ruff in CI, a token-gated HTTP transport, no bundled third-party data and a CC0 licence.

The BCI MCP servers I found target scalp EEG. I built one for the data a high-channel-count implant produces. An LLM opens a session from a local NWB file, a folder of WAV clips, a live Lab Streaming Layer stream, or an NWB file streamed from the DANDI Archive by HTTP range requests, then works through 24 tools that return summaries and figures rather than raw arrays, so results fit in a context window. A synthetic motor-cortex source with ground truth makes the analysis testable offline, and a stub documents what a live implant adapter would need once a vendor publishes an API.

The analysis side covers signal quality, threshold spike detection with precision and recall against ground truth, firing rates, ridge and Kalman decoders, trial-aligned PSTHs, spike sorting through spikeinterface's built-in sorters, GPFA and PCA latent factors, and probe geometry. Decoder hyperparameters are chosen by blocked cross-validation inside the training split. Datasets that record only during trials have their gaps tracked and left out of rates and decoding instead of being read as silence. Sorting uses the probe geometry, so on a simulated 20 µm probe it finds the 12 real units where treating contacts independently reports 15.

On MC_Maze_Small (DANDI 000140, 142 units) ridge decodes hand velocity at R² 0.50 and Kalman at 0.34. On FALCON H1 (DANDI 000954, 176 channels) a ridge decoder trained on the first held-in day scores 0.43 on that day's minival split, 0.07 one week later and below zero on the held-out days, which is the decay the benchmark exists to measure. On the simulator, whose true latent is 2-D cursor velocity, GPFA finds two dominant factors that explain velocity with R² 0.95 against 0.68 for PCA. The decoders are simple causal linear baselines, not state of the art, and FALCON's test labels are private, so none of them is a leaderboard score.

The source contract has no write, stimulate or configure method, and none will be added without a separate safety design. The server runs on stdio with no telemetry; HTTP is opt-in, refuses to bind off loopback without a bearer token, and the README says to put TLS in front of it. No third-party data is bundled and every adapter returns the dataset's licence and citation. Of the 52 tests, 51 run offline with ruff in GitHub Actions and one streams a real file from DANDI on demand. Published under CC0 as `io.github.happyc0der/ephys-mcp`; research software, not a medical device.

### ledger (`ledger`)

CRM pipeline-review agent whose every number and quote is checked in code before a manager sees it.

- 2026 · not yet public · tags: swe ml data · on no resume
- stack: Python, FastAPI, pandas, SQLite, Gemini Flash-Lite, Ollama, PRISM, pytest
- stats: 92% semantic recall · 0 of 86 false alarms · 97 to 0 fabrications
- Pipeline-review agent for the Revenue Intelligence track of Block Convey's AI x GTM Hackathon: the model fills a fixed claim schema with verbatim buyer quotes, and code compares each claim to the CRM, including across deals in one account.
- On 235 deals with 18 planted anomaly types, 92% semantic recall at 100% precision and 0 of 86 clean deals flagged, where the same model asked to list issues scored 32% recall and flagged 15 of 86.
- From the naive v1 to v3, revenue captured in the agent's top 20 rose from 60% to 77% of what real outcomes allowed, fabricated amounts, day gaps and quotes fell from 97 to 0, and every model call is traced in PRISM.

Ledger is my solo entry for the Revenue Intelligence track of Block Convey's AI x GTM Hackathon, a one-day build in New York on 2026-10-17. A sales manager asks what the team should work on this week. Ledger reads the CRM snapshot and every call note and email, and answers per deal with a win probability, the buyer's objection quoted from the record and one next action. The model only reads: it fills a fixed claim schema (budget status, decision timeline, economic buyer, competitor, last promise) with a verbatim quote per slot, and code compares each claim to the CRM fields, including across deals in the same account. A claim without a quote is dropped, and every check shows as a pass or fail receipt in the UI.

The demo company comes from the public Maven Analytics CRM dataset: the 228 open deals of one team, with their real later outcomes hidden from the agent. The source has no text, so I generated call notes conditioned on each deal's real outcome and planted 18 anomaly types, such as a stage that contradicts the buyer, a contact who left the company or a promise that expired. On the resulting 235 deals a CRM-rules baseline finds 0% of the semantic anomalies, the same model asked to list issues finds 32% and falsely flags 15 of 86 clean deals, and Ledger finds 92% at 100% precision with 0 clean deals flagged. Against the real outcomes, the naive v1 captured 60% of the closable revenue in its top 20 and fabricated 97 amounts, day gaps or quotes; v3 captures 77% and fabricates none. Objection and next-action accuracy (82% to 94%, 87% to 92%) are scored against labels I planted, so I read them as a check that the model hears the buyer, not as independent truth.

Every model call and agent run is traced in PRISM, the sponsor's observability tool. Its PII guardrail flagged phone numbers in v1 traces that do not exist in the data; the local model I used to paraphrase the notes had invented them. That failure and 12 others, each with its evidence and attribution and all but one with a fix, are in FINDINGS.md, and a deterministic auditor now re-finds them without ground truth. No prompt or model setting was changed after seeing results; the fixes were comparison bugs and label gaps, all listed.

The rest is built for a weekly loop: run history in SQLite, a lifecycle per finding, draft CRM updates a person approves before export, per-rep digests, HubSpot and Salesforce ingest presets, and a FastAPI page with a receipt beside every claim. 32 tests pass. Inference defaults to a local Ollama model; the full comparison ran on Gemini Flash-Lite. The code is not yet public.

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

Cost-aware trading research harness and paper-trading runner for a $100 Alpaca ETF account, where no model has yet earned promotion over the baseline.

- 2026 · not public · tags: quant ml swe · resumes: quant
- stack: Python, pandas, LightGBM, TabPFN, Chronos-2, Kronos, Alpaca, Zerodha Kite
- stats: 14 models, 2 markets · 0 promoted to live · 44 tests
- Built a cost-aware evaluation harness (purged walk-forward, CPCV, Deflated Sharpe, PBO, random-portfolio null) and ran 14 models, from vol-targeted baselines to LightGBM, CatBoost and TabPFN meta-labelling and the Chronos-2 and Kronos foundation models, on 8 US ETFs over 2011 to 2024.
- No candidate beat the vol-targeted equal-weight baseline after costs (best 0.68 Sharpe against 0.81), so none was promoted; zero-shot Kronos called 5-day direction right 46.6% of the time on US ETFs.
- Shipped the execution path anyway: Alpaca and Zerodha Kite adapters, a $100 paper account on a launchd schedule, drawdown throttle, persistent kill switch, deterministic client order IDs, and four separate gates before real money.

I built this to answer one question before any money moves: which of the models the literature recommends still work on liquid US ETFs after retail costs. The answer so far is none of them, and the repo is built so that result cannot be tuned away.

The harness decides at the close and executes at the next open, runs a purged walk-forward with quarterly refits and a 5-day embargo, adds CPCV paths, a Deflated Sharpe computed over every trial ever recorded, the probability of backtest overfitting, and a random-portfolio placebo with the same exposure and switching rate. It simulates the $100 account itself: $10 minimum order, fractional shares, full spread and fees. Data from 2025 onward is an untouched holdout. Fourteen entrants ran on 8 ETFs over 2011 to 2024: buy-and-hold, equal weight, vol-targeted equal weight, trend, a jump-model regime switch, LightGBM, CatBoost and TabPFN meta-labelling on triple-barrier labels, Chronos-2 and Kronos as standalone signals, and an ensemble.

Vol-targeted equal weight scored a net Sharpe of 0.81. The best candidate, the regime switch, scored 0.68 and beat the baseline in 0 of 5 segments. The meta-labelled models turn the book over 16 to 19 times a year and drop from roughly 0.5 to 0.6 gross Sharpe to about 0.3 net. Chronos-2 called the 5-day direction right 51% of the time, below the 56% from always predicting up. Kronos, which reports a profitable CSI300 backtest in its own paper, hit 46.6% zero-shot and 47.4% after fine-tuning on the same ETFs. The probability of backtest overfitting across all 14 trials was 0.06, so the baselines win in and out of sample alike. The same harness on 5 NSE ETFs came closer: the regime switch reached 1.08 against 0.93 and won 3 of 5 segments, but its Deflated Sharpe was 0.81 and random portfolios with the same exposure reached 1.11 at their 95th percentile, so it stays on a watch list.

The execution side runs regardless, with the unpromoted baseline. Since 2026-09-24 it has paper traded on Alpaca under launchd: long-only, at most 35% per ETF, 10% target volatility, exposure halved at a 5% drawdown, a kill switch at a 10% drawdown or a 3% daily loss that stays tripped until reset by hand, and deterministic client order IDs so a re-run cannot double-submit. Real money needs four things at once: live keys, a config flag, a promoted model and a command-line flag, plus at least three months of paper results inside the backtest's range. A Zerodha Kite adapter and a systemd kit for a static-IP server cover the Indian side, which has only run in dry-run mode so far. The code is local, with 44 tests.

### GridSentry (`gridsentry`)

Post-hackathon audit, fixes, test suite and CI for Utkarsh Mittal's NEPA environmental permit agent (FastAPI and Next.js).

- 2026 · tags: swe data · on no resume
- https://github.com/UtkarshMitta/GridSentry
- live: https://grid-sentry-web.vercel.app
- credit: The app is Utkarsh Mittal's (UtkarshMitta on GitHub): the hackathon build and the first 4 commits are his. The post-hackathon audit, the fixes, the test suite, the linting and the CI are mine, as 7 commits plus the merge of PR #1, 8 of the repo's 12.
- stack: Python, FastAPI, pytest, TypeScript, Next.js 14, Leaflet, GitHub Actions, ruff
- stats: 0 to 111 API tests · 25 web, 9 live checks · PR #1: 48 files
- Audited a hackathon NEPA permit agent against the live federal GIS services for about 17 sites: non-US sites came back as clean, critical habitat was never detected, a dead data service was reported as clean, and two citations were to a nonexistent statute and a rescinded rule.
- Fixed the data pipeline, citations and UI in PR #1 (48 files, 3668 additions, 887 deletions), then 7 more bugs in a review pass, including a protected-land query that kept 25 of up to 329 nearby records and could drop the park a site sits in.
- Took tests from 0 to 111 offline API tests, 25 web tests and 9 opt-in live checks, added ruff and ESLint, and CI on Python 3.12 and 3.14; the app is live at grid-sentry-web.vercel.app.

GridSentry is Utkarsh Mittal's NEPA environmental permit agent, built at a hackathon. You give it the coordinates of a proposed energy project and it queries federal datasets (USFWS wetlands and species, FEMA flood zones, USGS protected areas), runs three agents (a geolocation analyst, a legal compliance officer and a red-team critic) and writes a cited environmental assessment draft. The app and the hackathon build are his. He added me as a collaborator, and the audit, the fixes, the tests and the CI are mine.

Several claims in the README were not holding, so I ran the real pipeline against the live federal services for about 17 sites, checked every citation and clicked through the UI. London and Mexico came back as low risk with a Categorical Exclusion likely, because the US-only datasets returned nothing. Critical habitat was never detected: IPaC returns populationSid as an object, so the ID match could never succeed. A data service that did not respond was reported as clean. State law was cited even when the jurisdiction had not been verified. Two citations were wrong: 54 U.S.C. § 101905 does not exist and 40 CFR 1501.3 was rescinded on 2025-04-11. The site acreage was a random number seeded from the coordinates.

PR #1 (48 files, 3668 additions, 887 deletions) added a coverage gate for non-US and offshore sites, fixed the habitat match, marks a missing layer NOT ASSESSED so it blocks a Categorical Exclusion, verifies the state with the keyless US Census geocoder, corrects the citations, makes acreage an input, and generalizes geometry so a run stores hundreds of KB instead of 4 to 10 MB. A second review pass found 7 more bugs, among them a protected-land query that kept 25 of 152 to 329 nearby records in arbitrary order and could drop the park the site sits in, and a failed database write that reported a run as complete. Each fix has a regression test that fails on the old code. After the merge I added typed API response models, a run history on the home page, ruff and ESLint, and GitHub Actions CI that runs both suites, both linters, the typecheck and a build on Python 3.12 and 3.14.

Tests went from 0 to 111 offline API tests (parsers on recorded real payloads, gates, report logic, the API and SSE lifecycle), 25 web tests and 9 opt-in checks against the live federal services. The site is live at grid-sentry-web.vercel.app, with the API on Render.

### Econometrics re-analysis (`econometrics-india`)

Re-analysis of my 2023 econometrics team project on crop yields and infant deaths across 673 Indian districts: the original headline effects were artefacts of the crop-index construction and of iid standard errors.

- 2026 · team of 5 · tags: data quant · resumes: data quant
- https://github.com/utkar22/Econometric-Analysis-of-Agriculture-and-Health-Across-India
- credit: The repository is Utkarsh Arora's (utkar22 on GitHub). The 2023 coursework was a team of five: Utkarsh Arora, me, Krishnasai Addala, Samarth Raina and Sejal Kardam. The 2026 re-analysis, the data pipeline, the R models, the review, the CI and the license are mine, merged as PR #1.
- stack: R, fixest, data.table, Python, pandas, GNU make, GitHub Actions
- stats: 673 districts, 6 years · tables match to 6 dp · within-R2 under 0.02
- Re-analysed my 2023 econometrics team project on crop yields and infant deaths across 673 Indian districts and six years: I reproduced both original regression tables to six decimals, then showed the crop indices were the yield of whichever crop row came first in the CSV, so the Kharif cash-crop effect (p < 1e-16 originally) is not significant once the index is built per category and the nitrate sample restriction is lifted.
- Rebuilt it as a deterministic pipeline, Python for a 3,585-row district-year panel with Census 2011, NFHS-4 and IMD rainfall joined through LGD district codes, R in fixest for six specifications with state-clustered standard errors and district and year fixed effects, under which the child-marriage and hospital-bed effects are indistinguishable from zero and within-R2 is below 0.02.
- Wrote the review, archived the original scripts with seven run-breaking bugs fixed, added a GPL-3.0 license and CI that reruns the whole pipeline on Ubuntu and fails if any committed table, the panel or the README changes; merged as PR #1 (114 files) with three follow-up commits for the CI and cross-platform reproducibility.

In 2023, five of us at IIIT Delhi (Utkarsh Arora, me, Krishnasai Addala, Samarth Raina and Sejal Kardam) wrote an econometrics course project asking whether crop yields, health-system indicators and state economics explain the share of reported infant deaths attributed to low birth weight across 673 Indian districts from 2011 to 2016. The repository is Utkarsh Arora's. In September 2026 I went back to it on my own to check whether the results held. They did not.

I started by reproducing both regression tables in the original README, which worked to six decimals but only with log(tap) in the Kharif model, where the committed script used tap in levels. The real problem was the crop indices: the script kept the first crop row of each district-year in whatever order the CSV had, so cash_index was that row's yield if it happened to be a cash crop and 0 otherwise. In the Kharif sample the kept row was a cash crop for 1,576 district-years and a cereal for 772. The Kharif and Rabi tables were the same annual outcome and regressors with a different first row. GDP, hospital beds, child marriage and nitrate vary only by state, but the standard errors were iid over 24 states, and clustering by state multiplies them by 2 to 3. With the indices rebuilt per category, clustered errors and the nitrate sample restriction lifted, the three headline effects go: child marriage from -0.08 (p < 0.001) to -0.01, hospital beds from -3.9 (p < 1e-8) to -2.8 (p = 0.13), and the Kharif cash-crop index from -0.20 (p < 1e-16) to -0.08 and not significant. The report's drop in child-marriage cases in 2014 is not in the data either: the yearly state totals are 214, 304, 240, 277, 298 and 321.

The rebuild is a Python data-preparation step and an R analysis. Python collapses the 41,773 crop rows to one row per district-year (3,585 rows) with per-season, per-category yield indices, within-district yield shocks and lags, and joins Census 2011, NFHS-4 and IMD monsoon rainfall through Local Government Directory district codes (594 of the 673 districts exist in Census 2011). R runs six specifications in fixest, from the original regressors with corrected indices through year and zone effects, district and year effects, Census and NFHS controls and lags, all with state-clustered standard errors. Between districts, two associations survive a 999-draw district cluster bootstrap: a higher state GDP per capita goes with a higher LBW share (+6.5 points per log point, 95% CI 4.0 to 9.0), which reads as cause-of-death reporting rather than nutrition, and a higher rabi cereal yield with a lower one (-1.5 per tonne per hectare, CI -1.9 to -1.0). Within districts over time nothing in the data moves the outcome: within-R2 is below 0.02 with district and year effects. Monsoon rainfall is too weak an instrument for yields (clustered first-stage F = 2.3), so no causal claim is made.

The original scripts are archived under legacy/ with seven run-breaking bugs fixed and nothing else changed, plus a map from each script to the two course reports. make all rebuilds everything and a second run produces no diff; generated CSVs are rounded (10 significant digits for the Python panel, 6 for the R tidy tables) so macOS and Linux agree byte for byte, and a GitHub Actions workflow reruns the pipeline on a clean Ubuntu runner and fails if any committed table, the panel, the codebook or the README changes. The review is in docs/REVIEW.md, with a final section recording an independent recomputation of the derived columns and of the fixest estimates against lm and sandwich. I added a GPL-3.0-or-later license. The work went in as PR #1 (114 files changed), merged by Utkarsh Arora, plus three follow-up commits on main for the CI and reproducibility; the latest run is green.

### Hawk signature study (`hawk-signature-study`)

Report, talk and a working keygen, sign and verify demo of Hawk, the lattice signature scheme withdrawn from NIST standardisation in July 2026.

- 2026 · tags: sec swe · resumes: sec
- https://github.com/happyc0der/hawk-signature-study
- stack: Python, NumPy, SymPy, Flask, pytest
- stats: 13-page report · 6 fixes to hawk-py · ~300x faster verify
- Study of Hawk, the hash-and-sign lattice signature scheme withdrawn from NIST's Additional Digital Signatures process on 29 July 2026, for CS-UY 3943 Post-Quantum Cryptography at NYU Tandon: a 13-page report on the algorithms, parameters and security reductions, a talk, and a Flask server exposing key generation, signing and verification over a JSON API with a demo page.
- Applied six correctness fixes to the vendored hawk-py reference code, each with a reproduction in PATCHES.md and with regression tests for the decoder and sentinel bugs: NumPy 2 integer promotion that made every verification fail, decoder bounds and failure-path bugs that crashed instead of rejecting malformed input, and a modular exponentiation fix that made Hawk-256 verification about 300x faster (6.04 s to 0.02 s) and cut the test suite from 30 s to 2 s.
- Kept the report and slides unedited after the break and documented the attack beside them: a polynomial-time reduction of Hawk-n key recovery to SVP in dimension n/2 + 1 that took the claimed cost from 2^150 to 2^108 for Hawk-512 and 2^288 to 2^182 for Hawk-1024, with Hawk-256 keys recovered end to end by the attack's authors.

A course project for CS-UY 3943, Post-Quantum Cryptography, at NYU Tandon in spring 2026: a 13-page report on Hawk's algorithms, parameters, security reductions and cryptanalysis, a talk, and a Flask server that serves key generation, signing and verification as a JSON API with a demo page for an Alice to Bob walkthrough. The report and slides were submitted on 8 June 2026. Seven weeks later the scheme was broken and withdrawn. I have kept them exactly as submitted, with the break documented on a separate page next to them.

Hawk was a hash-and-sign signature over the power-of-two cyclotomic ring whose security rested on module-LIP rather than the SIS and LWE assumptions behind ML-DSA and Falcon. That diversity was its selling point, along with 555-byte Hawk-512 signatures and no floating point in signing or verification. On 28 July 2026 Straznickas and Weis published an unconditional polynomial-time reduction of Hawk-n key recovery to SVP in dimension n/2 + 1, roughly half the dimension the parameters were sized against, and the Hawk team withdrew the submission the next day. Claimed key-recovery cost fell from 2^150 to 2^108 for Hawk-512 and from 2^288 to 2^182 for Hawk-1024, and the authors recovered real Hawk-256 keys. My report had named the long-term hardness of smLIP over CM fields as the primary open question and said Hawk was poised for standardisation if that assumption held up over the next two years. It held up for seven weeks.

The demo vendors the hawk-py Python reference implementation, and getting it to run on current NumPy meant fixing it. NumPy 2 integer promotion made every verification fail, a decoder check used and where the specification says or so random input raised IndexError instead of being rejected, a length check compared bits against eight times the bit length and could never fire, and two failure paths returned the wrong sentinel and crashed instead of rejecting. Replacing `(g ** b) % p` with `pow(g, b, p)` in the root finder, which had been building a number of roughly 130 million bits before its first modular reduction, made Hawk-256 verification about 300x faster, 6.04 s to 0.02 s, and cut the test suite from 30 s to 2 s with bit-identical output. Every change is listed with a reproduction in `PATCHES.md`, and the tests cover round trips, spec-conformant encoded sizes, tampered messages, wrong keys, corrupted and truncated signatures and random garbage.

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

m parties share n one-time pads. Every message is broadcast to all the others at the same instant, at most d messages are undelivered at any moment, and nobody takes turns. No pad may ever be used twice, and when the pads run out as few as possible should be stranded. The obvious answer, a fixed slice of the pads per party, is trivially secret, but a party can only spend its own slice, so one talkative party strands 4,000 of 5,000 pads at m=5. That static partition was the team's October 2025 version of this project, with a simulator that never modelled delivery delay.

In September 2026 I replaced it with chunk-reserve. Pads are grouped into chunks of d. Each party has a private current chunk and a public reserve chunk, and everyone replays one rule over the delivered history: when a delivered message from party j uses a pad inside reserve[j], reserve[j] moves to the next chunk that has never been assigned. Delivery is simultaneous, so the delivered history is common knowledge and every party computes the same reserve map with no requests, grants or acknowledgements. The reserve map is a partition of the chunks, which gives secrecy with no timing assumption at all. A chunk size of exactly d gives wait-freedom, and d-1 does not. Worst-case waste is d(2m-1) - m + (n mod d), an equality rather than a ceiling: the worst schedule is a party that sends once and then goes quiet, which none of the first five schedules in the grid produced. They reported 20 wasted pads at m=5, d=5; the one_shot schedule reaches 36, and it stays 36 at n=5,000, 20,000 and 80,000. The proved bound there is 40; the last d-1 pads need the draining party to stop mid-chunk too, which no schedule can express, so a unit test constructs that case directly.

The simulator is built to be unkind: four delivery orders including one that holds back the message each party is waiting on, a lazy mode that keeps the backlog at the full d, and both readings of the d bound. Every pad handed out is checked against every pad before it, so a completed run is a proof of no reuse for that schedule, and a deliberately broken protocol confirms the check fires. The 310 tests run in about 8 seconds. CI runs them on Python 3.11 to 3.13, lints, and diffs the committed 180-cell summary.csv against a fresh run of the evaluation, so a protocol change that was never re-evaluated fails the build. Implementing the handout's two-party protocol as a reference turned up two defects in it: the gap check is off by one, and taking the newest arrival at face value lets a party's view of the other's pointer move backwards under LIFO delivery.

A second protocol, GrantProtocol, covers the weaker model where a sender gets no feedback about its own messages; it matched chunk-reserve on waste under the first five schedules, strands 56 pads to chunk-reserve's 36 under one_shot at m=5, d=5, and pays for its round trips in stalls. The 15-page report in the repo has the proofs, the evaluation and the limits: the (m-1)d optimality argument covers only the case where m-1 parties are silent from the start, and everything is simulated in one process rather than distributed.

### garmin-connect-api (`garmin-connect-api`)

Typed Python library, local HTTP service and MCP server that read and write Garmin Connect, including uploads of completed strength sessions.

- 2026 · in progress · tags: swe · on no resume
- stack: Python 3.12, FastAPI, FastMCP, pydantic, fit-tool, Typer, python-garminconnect, pytest
- stats: 37 HTTP operations · 35 MCP tools · 67 tests, no network
- Read/write layer for Garmin Connect with one typed core and three faces: a Python library, a 37-operation FastAPI service, and 35 MCP tools, all but four generated from its routes so the tools cannot drift from the API.
- Uploads completed strength sessions, which Garmin's own developer programme has never offered, by encoding them as FIT files with set messages; the file serial is derived from the session so a repeat upload should land as a duplicate rather than a second activity, though the upload path has not yet been run against a live account.
- 67 offline tests against real Garmin payload shapes, the FIT round trip and the 1,527-entry exercise catalogue; ruff and mypy clean; the password is typed only at the CLI and the service and MCP server only ever read stored tokens.

Garmin Connect has no public API that a person can use for their own account. The official developer programme is for businesses, has been closed to new applicants since spring 2026, and has no endpoint that uploads a finished workout. I built this so I could read and write my own account from Python, from HTTP, or from Claude.

The library returns pydantic models with Garmin's inconsistencies ironed out: weights in kilograms, instants as timezone-aware datetimes, snake_case throughout, and the untouched payload kept on `raw`. `garmin serve` puts 37 operations on localhost with OpenAPI docs. `garmin mcp` turns those same routes into MCP tools with FastMCP, plus four hand-written ones (account status, exercise lookup, recent strength sessions with their sets, a week summary). Raw file downloads and sample-level detail stay off the tool list so they do not flood a context window.

Logging a completed session is the part nothing official offers. I encode it as a FIT file with set messages and post it to the upload service the Connect website itself uses. Every write is first validated against the bundled catalogue of 1,527 exercises in 47 categories, and an unknown name gets near misses back instead of Garmin's bare 400. The password is typed in exactly one place, `garmin login`; the service and MCP server only read stored tokens and answer 401 without them. Garmin added Cloudflare fingerprinting and per-account rate limits in March 2026, and a run of failed logins can lock an account for a day or more, so nothing here retries a login and a 429 is surfaced rather than swallowed.

This goes through `python-garminconnect` and Garmin's private endpoints, so it is unsanctioned by Garmin's terms and meant for one's own account. Reads, the day summary, the MCP tools and the workout create, schedule, unschedule, delete cycle are verified against my real account. The completed-session upload is covered by the FIT codec tests but I have not yet run it live. Still in progress.

### localagent (`localagent`)

Local-only LLM agent with image generation, QLoRA fine-tuning and a story-to-comic pipeline, split across a Mac and a Windows GPU laptop.

- 2026 · not public · tags: ml swe · on no resume
- stack: Python, Ollama, Qwen3-14B, PyTorch, diffusers, PEFT, SDXL, llama.cpp
- stats: 49 tok/s Qwen3-14B · 0.4 s per fast image · 5-page comic, 25 panels
- Local agent harness in Python: Qwen3-14B under Ollama with a tool-calling loop over seven shell, file and image tools; the agent runs on a Mac and reaches the models on a Windows GPU laptop through an SSH tunnel.
- Two image services on the GPU box, SD-Turbo at about 0.4 s per 512 px image and FLUX.1-schnell in 4-bit at 28 to 36 s per 1024 px image, plus a QLoRA pipeline that fine-tunes Qwen3-14B and imports the result into Ollama through llama.cpp in about 10 minutes.
- Story-to-comic pipeline: the LLM writes a panel script, SDXL draws each panel in about 12.5 s, Pillow letters the pages; includes SDXL style and character LoRA training and a 5-page, 25-panel Alice in Wonderland example.

An assistant that runs entirely on hardware I own: no cloud provider, no API keys. Qwen3-14B runs under Ollama on my Windows laptop (RTX 3080 Ti, 16 GB) at about 49 tokens per second. The agent itself runs on the Mac and reaches the models through an SSH tunnel, so its shell and file tools act on the Mac's files and nothing is opened on the Windows firewall. Tool arguments are validated before a call and every error goes back to the model as text it can correct from. Reasoning is off by default: it made a simple reply about 30 times more expensive, on every tool call.

Two image services sit on the GPU box: SD-Turbo for fast images (about 0.4 s at 512 px, loaded next to the LLM) and FLUX.1-schnell in 4-bit for quality (28 to 36 s at 1024 px, with the LLM unloaded). A QLoRA pipeline fine-tunes Qwen3-14B on a folder of documents or captured agent conversations at about 2.9 s per example with a 12.0 GB peak, then merges the adapter, converts it to GGUF with llama.cpp and imports the result into Ollama, about 10 minutes end to end.

The comic pipeline turns a story into lettered pages: the LLM writes a panel-by-panel script, SDXL draws each panel in about 12.5 s, and Pillow adds borders, speech bubbles and captions. It can also cut existing comic pages into panels, describe them with a local vision model, and train SDXL style and character LoRAs (5.8 s per step, 5.9 GB peak). The included example is Alice's Adventures in Wonderland, chapter I: 5 pages, 25 panels, about 5 minutes of art.

It is deliberately not a git repository. There are no automated tests.

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
- credit: Course team project with adityaahuja7 and deeptanshu (GitHub handles). The September 2026 test suite, launcher and CI are mine.
- stack: Python, gRPC, protobuf, unittest, ruff, GitHub Actions
- stats: 64 tests · CI on 3 OSes · team of 3
- MapReduce framework from scratch in Python over gRPC, with the master, every mapper and every reducer as its own process on its own port, used to run K-Means; the master ships index ranges rather than data, and reducers pull their partitions from the mappers over gRPC.
- Handles both failure modes in the spec: a worker that reports a failed task is retried, and a force-stopped worker's split or partition is reassigned to a surviving worker in append mode so it keeps the work it already owns.
- 64 unittest tests check the distributed result against a from-scratch single-process K-Means to within 1e-6 over four mapper by reducer configurations, and CI runs them on Python 3.10 to 3.13 on Linux plus 3.12 on macOS and Windows, with a separate fault-injection job.

Assignment 3 of CSE530 Distributed Systems at IIIT Delhi, Winter 2024, built with two teammates over four days in April 2024. The master, each mapper and each reducer is a separate process with its own port and its own output directory, and everything between them goes over one gRPC service with four calls: Map, StartReduce, Reduce and returnCentroid.

One iteration works like this. The master splits the input by index range and never ships points. Each mapper reads its range, keys every point to its nearest centroid and writes one partition file per reducer. Each reducer then pulls its partition from every mapper over gRPC, averages each group and returns the new centroids. The loop stops when no centroid moves more than 0.0001 on either axis, or after the requested number of iterations. Failures come in the two shapes the spec asks for. A worker that answers with a failed status (injected at 5 percent per call) is retried until it succeeds. A worker that is gone, so its RPC raises, has its split handed to the next mapper or its partition to a random surviving reducer, which is told to append so it keeps the work it already owns.

The team code is from April 2024. In September 2026 I went back to it for a documentation, lint and dead-code pass, and added what the original never had: a POSIX launcher, a 64-test unittest suite organised around the assignment rubric, and GitHub Actions. The central test replays the same K-Means from the same random starting centroids in a from-scratch single-process implementation and asserts the two agree to within 1e-6, across 1x1, 3x2, 4x3 and 8x2 mapper by reducer configurations. CI runs ruff, the suite on Python 3.10 to 3.13 on Linux plus 3.12 on macOS and Windows, and a fault-injection job that force-stops a mapper and a reducer mid-run. All eight jobs are green on the latest commit, and the fast suite runs in a few seconds on the 25-point sample input.

The README lists what still breaks. An iteration that leaves a centroid with no points ends the run with an IndexError, and a split reassigned after a force-stop can be wiped if the replacement mapper's own Map call has not finished yet. The tests skip rather than fail on the first, and the second is documented as reproducible with a non-zero sleep argument.

### Snakes and Ladders as a Markov chain (`snakes-ladders-markov`)

Exact game length of Snakes and Ladders from the fundamental matrix, checked against a dice simulation and 47 tests.

- 2022 · tags: quant · resumes: quant
- https://github.com/happyc0der/SPA_Project
- credit: Aman Kumar wrote the empirical transition-matrix tally in the original 2022 simulation.
- stack: Python, numpy, matplotlib, pytest
- stats: 39.6 turns expected · d15 is fastest · 47 tests
- Modelled Snakes and Ladders as a 101-state absorbing Markov chain in numpy and computed the exact expected game length, 39.6 turns on a six-sided die, as a row sum of the fundamental matrix (I - Q)^-1.
- Checked the matrix against a brute-force dice simulation and swept die sizes from d2 to d24: a 15-sided die gives the shortest game at 25.8 turns, a d20 is slower than a d12, and a one-sided die can never win.
- Reworked the 2022 coursework in 2026 with 47 pytest tests that pin the exact expectation, the completion curve, the reachable squares and the simulation against the chain.

The board is squares 0 to 100 with 19 snakes and ladders, and a roll past 100 is not played, so the player stays put and loses the turn. Where you land depends only on where you are, which makes the game a 101-state Markov chain with square 100 absorbing. One 101 by 101 transition matrix then answers every question exactly. Removing the absorbing square leaves Q, and the row sums of the inverse of I - Q are the expected turns from each square: 39.5984 from the start with a fair d6. The fewest turns a win can take is 7, half of games are over by turn 33, and 99% by turn 130. This started as Stochastic Processes coursework at IIIT Delhi.

Two things fell out of the die sweep. A bigger die helps only up to a point: d6 takes 39.60 turns, d8 31.97, d15 25.84, and then the house rule bites, since more rolls near the end are too big to play, so a d20 (27.22) is already slower than a d12 (27.07). A d3 is slower than a d2 (81.18 against 72.01) because its reachable squares line up badly with the snakes. With a d1 the board cannot be won at all: the player walks 26 to 47, lands on the snake at 48, returns to 26, and repeats, with only 18 squares reachable. Every snake and ladder head is unreachable, so 82 of the 101 squares can end a turn, and the stationary distribution is all mass on square 100, which T^n reaches to within 1e-4 at n = 165.

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

Raft consensus in Python and gRPC for a distributed systems course, where my part was the leader lease and the per-node event log.

- 2024 · Finished April 2024 · team of 3 · tags: swe · on no resume
- https://github.com/adityaahuja7/Raft-Implementation
- credit: The repository is Aditya Ahuja's (adityaahuja7 on GitHub) and the team was Aditya Ahuja, Deeptanshu Barman and me, for CSE530 at IIIT Delhi. Aditya wrote the node, the election, the client handling and the cloud deployment. Deeptanshu wrote the log replication handlers, the parallel vote requests and the metadata class. Mine are 3 of 45 commits: the leader lease (the lease field on the RequestVote response, the lease state and its start, renew and timeout handlers, lease-gated reads and writes, step-down on expiry) and the first version of the per-node dump and metadata files.
- stack: Python, gRPC, Protocol Buffers, Google Cloud
- stats: 5-node cluster · 8 s leader lease · 3 of 45 commits
- Added leader leases to a team Raft implementation in Python and gRPC: the leader renews its lease (8 seconds in the final code) when its heartbeats reach a majority of the cluster and steps down when it expires, and followers hold off elections while a lease is live.
- Added a leaseDuration field to the RequestVote response next to the existing one on AppendEntries, and made the leader refuse GET and SET while it holds no lease.
- Added per-node dump and metadata files that record election timeouts, votes, step-downs, rejected AppendEntries and failed RPCs, so a run of the 5-node cluster can be read back afterwards.

Raft-Implementation is a course project for CSE530 Distributed Systems at IIIT Delhi in 2024, with Aditya Ahuja and Deeptanshu Barman. The repository is Aditya's. It is a Raft cluster in Python: five nodes talk over gRPC using the two Raft RPCs, RequestVote and AppendEntries, plus a serveClient RPC that takes GET and SET commands from a small command line client and forwards them to the leader. Each node keeps its log, a metadata file (term, commit length, vote) and a dump file on disk, so a restarted node picks up where it left off. The election timeout is drawn from 5 to 11 seconds and the leader sends a heartbeat once a second. The cluster was deployed on five Google Cloud VMs.

My part was the leader lease, the idea from YugabyteDB that lets a leader answer reads without a round trip to the followers. The leader renews its lease each time its heartbeats reach a majority of the cluster and steps down to follower when the lease timer fires. My commit set the lease to 3 seconds and Deeptanshu raised it to 8 the same day. Followers learn the lease duration from AppendEntries and do not start an election while the lease is live. The RequestVote response carries a lease duration so that a winning candidate can wait out the old leader's lease before it serves. GET and SET are refused with a message while the leader has no lease. For this I added the lease field on the RequestVote response to the proto, the lease state and its start, renew and timeout handlers in the node, and the lease checks in the client path. The AppendEntries lease field and the timer class were already there from Deeptanshu.

I also added the first version of the per-node dump and metadata files, writing a line for each election timeout, vote granted or denied, lease expiry and step-down, accepted or rejected AppendEntries and failed RPC. Deeptanshu then moved the metadata into its own class. My share is small: 3 of 45 commits, on 30 and 31 March 2024. Aditya and Deeptanshu wrote the election, replication and client code around it.

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

The repo ships the course's grader: 5 simple and 2 hard programs each for the assembler (assembly in, binary out) and the simulator (binary in, trace out), plus 4 error programs the assembler must reject. Rerun in September 2026 on Python 3.14, every test passes, 20 of 20 marks on each half. To be exact about the share: at my last commit the simulator matched 1 of the 7 traces, and Vedant's and Aditya's later commits changed 9 lines (among them a memory word initialised with 15 zeros instead of 16, the ld instruction, and when flags reset) to reach 7 of 7. One rough edge remains: the file still calls the matplotlib scatter plot at exit with the import commented out, so it ends with a NameError after the memory dump. The grader reads only stdout, so the trace is unaffected.

### Customer attrition (`ml-project-churn`)

Four-person IIIT Delhi machine learning course project comparing eight classifiers for telecom churn, and why its reported accuracy does not hold up.

- 2022 · team of 4 · tags: ml data · on no resume
- https://github.com/IshitBajpai/ML_Project
- credit: The repo is Ishit Bajpai's (IshitBajpai on GitHub). The project was a team of four: Ishit Bajpai, Keshav Rajput, Prachi and Satyam Arora, with equal credit stated in the report. My share was debugging, result analysis, the train and test split, PCA and t-SNE, the dataset handling and the report. All 3 commits are Ishit's uploads of the group's notebooks, slides and report.
- stack: Python, scikit-learn, XGBoost, pandas, seaborn, Jupyter, Google Colab
- stats: 7,043 rows, 38 columns · 8 classifiers · team of 4
- Machine learning course project at IIIT Delhi in a team of four: churn prediction on the Maven Analytics telecom dataset of 7,043 customers and 38 columns, comparing logistic regression, two naive Bayes variants, SVM, random forest, AdaBoost, XGBoost and an MLP, most under 5-fold cross-validation.
- My share was debugging, result analysis, the 75:25 stratified split, PCA and t-SNE, the dataset handling and the report; the group reported an RBF-kernel SVM as best at 96.72% accuracy and 93.51 F1.
- The reported scores are inflated by target leakage: the Churn Category and Churn Reason columns, filled only for churners, stayed in the feature matrix, and the ROC-AUC helper fitted each model on the test set it then scored.

This was the final project for CSE/ECE 343 Machine Learning at IIIT Delhi, submitted on 4 December 2022 by a team of four: Ishit Bajpai, Prachi, Satyam Arora and me. The repository is Ishit's and holds the group's four Colab notebooks, the slides and the report. The task was to predict which telecom customers churn. The data is the Maven Analytics telecom churn set: 7,043 customers from one quarter of 2022, 38 columns, and a three-way status of joined, stayed or churned that we collapsed to churned (1,869 customers) against the rest (5,174). Per the slides, my share was debugging, result analysis, the train and test split, PCA and t-SNE, the dataset handling and the report.

The pipeline drops the customer ID, fills missing values with a KNN imputer (the report says mean for numeric columns, but that line in the notebook never assigns its result), label-encodes every categorical column, removes any feature correlated above 0.85 with another, drops low-variance numeric columns, standardises, and reduces to 8 principal components. The split is 75:25 and stratified. We then ran logistic regression, Gaussian and Bernoulli naive Bayes, SVM with four kernels, random forest, AdaBoost and XGBoost with small grid searches, and an MLP with hidden layers of 256 and 32, scoring the scikit-learn models with 5-fold cross-validation and the MLP on the held-out quarter. The group's table put the RBF SVM first at 96.72% accuracy and 93.51 F1, with XGBoost highest on ROC-AUC at 99.8.

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

Assignment 1 of Advanced Machine Learning at IIIT Delhi, done with Pratyush Kumar in February 2024 in two milestones. The data is synthetic tabular data with 24 price-series style features per row (normalised open, high, low, close and volume, moving averages, a CMO and slope features) at three label-noise levels: a clean set of 7,800 rows, a low-noise set of 312,000 rows and a high-noise set of 249,600 rows. Each method predicts two targets, a 12-class era label and target_10_val, from a 70/15/15 train, test and validation split with seed 42.

Milestone 1 set a baseline MLP against two methods for noisy labels. Noise Attention Learning keeps the MLP and swaps the loss for the paper's attention-weighted loss, without its regularisation term. It helped where noise was present and hurt where it was not: on the era target, test accuracy went from 63.79% to 74.19% at low noise and from 44.90% to 49.75% at high noise, but fell from 76.41% to 42.05% on clean data. On target_10_val the gains were small (79.11% to 80.26% at low noise). Our SubTab port was partial: an autoencoder trained on overlapping feature subsets with the reconstruction loss only, no contrastive term, feeding an MLP with the NAL loss. It scored well below the baseline (15.07% on low-noise era) and the report says so.

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

The original shipped one logistic regression, trained on a 70/30 split with scaling fitted before the split. `train.py` now holds out a stratified 20% test set, keeps imputation, scaling and one-hot encoding inside each pipeline, searches nine algorithms with randomised search and 5-fold cross-validation, selects on average precision (about 26.5% of customers churn, so accuracy is the wrong yardstick) and tunes a decision threshold per model for F1. Any of the nine can be picked in the app, a compare mode scores an uploaded CSV with all of them, the whole gallery is about 6 MB, and a retrain is deterministic and takes about a minute.

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

## Skills

- languages: Python, C, C++, Kotlin, TypeScript, JavaScript, SQL, Java, R, Bash, eZ80 assembly, Monkey C
- ml: PyTorch, deep learning, scikit-learn, LightGBM, XGBoost, CatBoost, Hugging Face transformers, NumPy, pandas, polars
- data: PySpark, Databricks, SQL, PostgreSQL, SQLite, pandas, Parquet, time-series forecasting, statistics (hypothesis testing, regression), econometrics (fixest), Streamlit, Altair, matplotlib
- systems: CMake, gRPC, PostgreSQL, SQLite, WebAssembly (sandboxed mods), Android (Jetpack Compose, Room), Next.js, React, FastAPI, Node.js, REST APIs, MCP
- security: applied cryptography, post-quantum cryptography (ML-DSA, ML-KEM), X25519, ChaCha20-Poly1305, HKDF, network security (TLS), OAuth 2.1 (PKCE, JWT), libsodium, liboqs, fuzzing (libFuzzer), mutation testing, ASan/UBSan, formal verification (ProVerif), security auditing and vulnerability assessment, threat modeling
- testing: pytest, Catch2, vitest, Robolectric, libFuzzer, ASan/UBSan, static analysis (clang-tidy, ruff, ESLint), ProVerif, unit and integration tests, CI
- ai: LLM agents (Google ADK, MCP, tool calling), vLLM, Ollama, LiteLLM, LoRA/QLoRA fine-tuning (PEFT), llama.cpp/GGUF quantization
- quant: backtesting (purged walk-forward, CPCV, Deflated Sharpe, PBO), financial modeling, econometrics (fixest, fixed effects, clustered SEs), time-series forecasting, Kalman filters, bandits, Markov chains
- tools: Git, CI/CD (GitHub Actions), Docker, AWS (CDK, App Runner, DynamoDB), Vercel, Linux, WSL2, Tailscale, Claude Code

## Activities

- Open source: ephys-mcp on PyPI and the MCP Registry (24 tools, 52 tests); six fixes with regression tests to hawk-py
- Treasurer, OWASP Student Chapter, IIIT Delhi
- Events head, Finnexia (finance club), IIIT Delhi; organised "The Critical Bid"
- Attended the first International Quantum Communication Conclave, New Delhi, 2023
