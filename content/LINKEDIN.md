# LinkedIn, paste-ready

Written from content/ on 2026-09-26. Limits: headline 220 characters, About 2,600, each project description 2,000, skills 50 (3 pinned). Paste each block as is.

## Profile URL

Change `linkedin.com/in/keshav-rajput-862267259` to `linkedin.com/in/keshav-rajput` (Settings > Edit public profile & URL). Then update the link in content/profile.yaml and rerun `npm run resumes`.

## Headline

New grad software engineer, MS Computer Science, NYU Tandon (May 2026). Systems, cryptography and ML: C, C++, Python, TypeScript. Post-quantum auth protocol in C11, C++23 game engine, Kaggle. happyc0der.github.io

## About

I finished an MS in Computer Science at NYU Tandon in May 2026 (GPA 3.67), after a B.Tech in Computer Science and Applied Mathematics at IIIT Delhi. I am looking for a new-grad role in software engineering, machine learning, security or quantitative research, in New York or remote in the US.

I build things end to end and measure them. Most of my projects ship with tests, CI and numbers a reviewer can check.

Recent work:

• mldsa-auth: post-quantum mutual authentication protocol in C11 (ML-DSA-65 over hybrid X25519 + ML-KEM-768). 0.45 ms handshake, 12 fuzz targets, 192 mutations run nightly, ProVerif model.
• Atlas: solo C++23 engine for map-based strategy games. Deterministic lockstep simulation with state hashing, WebAssembly-sandboxed mods, 1,045 tests, CI on three platforms.
• LFP2Vec audit: reproduced a NeurIPS 2025 neuroscience model on public data and traced its cross-lab failure to a preprocessing mismatch; a 100 Hz low-pass restores the published margin.
• DOOMCE and TRENCHFIRE: a from-scratch first-person raycaster for the TI-84 Plus CE (C and eZ80 assembly, 24 KB) and its port to the Garmin Venu X1, now on the Connect IQ store.
• TideFit: security audit, Next 14 to 16 upgrade and production launch of a friend's Next.js app. 15 findings, npm audit 6 vulnerabilities to 0, tests 0 to 45.
• ForgeLog: offline Android gym tracker in Kotlin with no network permission, 830 tests, released as a signed APK.
• Kaggle: Biohub Cell Tracking (public leaderboard 0.952), Playground S6E9 (AUC 0.9465), TrafficFlowBench (0.845), and a Gemma 4 Developer Agent entry in progress.

Everything, with code and screenshots: happyc0der.github.io
GitHub: github.com/happyc0der

## Open to work (recruiter settings)

Titles: Software Engineer, Machine Learning Engineer, Security Engineer, Data Engineer, Quantitative Developer, Quantitative Researcher
Location types: On-site (New York, NY), Hybrid, Remote (United States)
Start date: immediately
Job types: Full-time

## Experience

Leave empty rather than pad it. Do not add projects as employers.

## Education

New York University, Tandon School of Engineering
Master of Science (MS), Computer Science
Sep 2024 - May 2026 · Grade: 3.67/4.0
Description: Machine Learning, Neuroinformatics, Foundations of Data Science, Applied Cryptography, Post-Quantum Cryptography, Big Data, Information Visualization, Database Systems, Open Source and Professional Software Development, Design and Analysis of Algorithms II.

Indraprastha Institute of Information Technology (IIIT) Delhi
Bachelor of Technology (B.Tech), Computer Science and Applied Mathematics, minor in Economics
2020 - 2024 · Grade: CGPA 8.19/10
Activities: Treasurer, OWASP Student Chapter. Events head, Finnexia (finance club).
Description: Distributed Systems, Operating Systems, Computer Networks, Advanced Machine Learning, Convex Optimization, Stochastic Processes, Statistical Inference, Game Theory, Econometrics, Valuation and Portfolio Management.

## Featured (in this order)

1. happyc0der.github.io (portfolio, link)
2. https://happyc0der.github.io/resume/ (resumes, link)
3. https://github.com/happyc0der/mldsa-auth (link)
4. https://apps.garmin.com/apps/f81aaa08-71a6-4bc2-8faa-716f37a8ad44 (TRENCHFIRE on the Connect IQ store, link)
5. https://github.com/happyc0der/atlas-engine (link)

## Projects (LinkedIn "Projects" section, one entry each)

### mldsa-auth
Dates: Sep 2026 · URL: https://github.com/happyc0der/mldsa-auth · Skills: C, Cryptography, Fuzzing
Post-quantum mutual authentication and session protocol in C11: ML-DSA-65 (FIPS 204) signatures over a hybrid X25519 and ML-KEM-768 key exchange, HKDF-SHA256, and a padded ChaCha20-Poly1305 record layer. 0.45 ms median handshake and 736 MiB/s record sealing. Tested with ASan and UBSan on Linux and macOS, 12 libFuzzer targets and 192 must-kill mutations run nightly in CI. On top of it, mldsa-authd: a login daemon with single-use login codes, device enrolment, revocation, key rotation and recovery codes, plus a ProVerif model of the handshake.

### Atlas
Dates: Sep 2026 · URL: https://github.com/happyc0der/atlas-engine · Skills: C++, Game Engine Development, WebAssembly
Solo C++23 engine for map-based strategy games, built in 25 gated milestones: SDL_GPU renderer, asset pipeline with hot reload, versioned scene serialization, audio, animation and 21 architecture decision records. Deterministic fixed-tick simulation with state hashing, replay, save and load, and lockstep play over ENet verified hash for hash between two processes; a million-cell tick runs in 694 us on four workers. Mods run as WebAssembly with no clock, filesystem or random generator. 1,045 tests, CI on macOS, Linux and Windows with sanitizer lanes and benchmarks gated at 1.25x of a recorded baseline.

### LFP2Vec audit
Dates: Sep 2026 · URL: https://github.com/happyc0der/lfp2vec-audit · Skills: PyTorch, Machine Learning, Neuroscience
Reproduced the fine-tuning stage of LFP2Vec (NeurIPS 2025) on public IBL and Allen Neuropixels data on a laptop: 0.74 ± 0.07 balanced accuracy against the paper's 0.68. Traced the cross-lab collapse to a preprocessing mismatch (spectra diverge up to 768-fold above 300 Hz) and showed a 100 Hz low-pass restores the published margin. Measured calibration under lab shift, which the paper does not report, and added an electrode-position control. 337 tests and a leakage check before every training run.

### DOOMCE and TRENCHFIRE
Dates: Sep 2026 · URL: https://github.com/happyc0der/doom-ports · Skills: C, Assembly, Embedded Systems
A from-scratch first-person raycaster, twice. DOOMCE runs on the TI-84 Plus CE in C and eZ80 assembly: about 24 KB, 5 to 7 fps, textured walls, variable floor heights, sliding doors, state-machine enemies, with every texture and sprite generated at startup. I measured 122 eZ80 cycles per VRAM byte, fit a frame-time model to it and moved the column fill to hand-written assembly. TRENCHFIRE is the port to the Garmin Venu X1 in Monkey C, rebuilt around a 0.2 ms per-draw cost: 1 to 2 fps to 15.6 fps moving. On the Connect IQ store: https://apps.garmin.com/apps/f81aaa08-71a6-4bc2-8faa-716f37a8ad44

### TideFit (audit and launch)
Dates: Sep 2026 · URL: https://tide-fit.vercel.app · Skills: Application Security, Next.js, TypeScript
The app is Utkarsh Mittal's Next.js trip planner for athletes; the audit, upgrade, tests, CI and launch are mine. Code review of all 45 source files and probing of the running app found 15 vulnerabilities (OAuth callbacks accepting any authorization code, a Supabase row-level security policy exposing every user's trips, a secret stored in a plaintext cookie, unmetered paid endpoints); 13 fixed and verified. Upgraded Next 14 to 16 and React 18 to 19 by hand across 16 merged pull requests: npm audit from 6 vulnerabilities to 0, tests from 0 to 45, CI that deploys main to Vercel. Live with private Blob storage, an edge rate limit and Strava and Google Calendar sign-in verified end to end.

### ForgeLog
Dates: Sep 2026 · URL: https://github.com/happyc0der/ForgeLog · Skills: Kotlin, Android Development, Jetpack Compose
Offline Android gym tracker: build programs, log sets fast, keep every workout on the phone. Kotlin, Jetpack Compose, Room, Hilt, MVVM; the manifest declares five permissions and no INTERNET permission. Rest timer on the lock screen survives process death; analytics for volume, estimated 1RM and personal bests; JSON backup and CSV export. 830 tests run on the JVM with no device, plus 38 instrumented tests on API 26 and 36. Released as a signed 2.3 MB APK.

### Custodian
Dates: Sep 2026 · URL: https://github.com/happyc0der/custodian · Skills: TypeScript, OAuth, AWS
Self-hosted MCP server and MCP App that checks a household inventory against the CPSC, NHTSA and openFDA recall feeds and tracks home maintenance: 10 tools, 5 screen views, a deterministic matcher that writes a reason for every match. Built for the Alexa+ track of Amazon Build, Ship, Shape 2026. Hand-written two-tier OAuth 2.1 authorization server (client_credentials, authorization_code with PKCE S256, ES256 JWTs, rotating refresh tokens, per-method scopes). Every tool call inside the 500 ms voice budget; tests assert p95 under 100 ms. TypeScript monorepo, 79 tests, AWS CDK stack synthesised in CI.

### Gemma 4 Developer Agent (Kaggle, in progress)
Dates: Sep 2026 - present · URL: https://github.com/happyc0der/gemma-swe-agent · Skills: LLM Agents, Python, Docker
Solo entry: an LLM agent in declarative Google ADK that fixes GitHub issues with Gemma 4 31B. Built swelite, a re-implementation of the organizers' unreleased evaluation harness (Docker sandboxes, the 9 fixed tools, an ADK YAML compiler, multi-pass patch verification): 109 of 129 public tasks pass gold checks. A 16 GB laptop GPU over SSH serves a vLLM proxy for 33-task holdouts per prompt change. Final ranking pending, competition ends December 2026.

## Skills (add these, pin the first three)

Python, C++, Machine Learning, C, TypeScript, Kotlin, SQL, R, PyTorch, scikit-learn, LightGBM, Cryptography, Post-Quantum Cryptography, Application Security, Fuzzing, OAuth, Distributed Systems, gRPC, WebAssembly, Android Development, Jetpack Compose, Next.js, React, FastAPI, Node.js, REST APIs, PySpark, Databricks, pandas, PostgreSQL, SQLite, Docker, GitHub Actions, CI/CD, AWS, Linux, Git, Large Language Models (LLM), Backtesting, Econometrics, Time Series Forecasting, Data Analysis, Software Testing, Game Engine Development, Embedded Systems

## Honors and awards

Nothing yet. Add Kaggle placements when the final leaderboards post (Biohub 2026-09-29, S6E9 2026-09-30, TrafficFlowBench 2026-11-06, Gemma 2026-12-02).

## Leave off

The GitHub bio line, the political meme game, the SOVEREIGN job-search tooling, and anything marked "not public" on the site.
