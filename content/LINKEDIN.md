# LinkedIn, paste-ready

Written from content/ on 2026-09-26; rewritten for human readers the same day. Limits: headline 220 characters, About 2,600, each project description 2,000, skills 50 (3 pinned). Paste each block as is.

## Profile URL

linkedin.com/in/happyc0der (set 2026-09-26; content/profile.yaml, the site and the PDFs carry it).

## Headline

Software engineer, new grad · MS Computer Science, NYU Tandon, May 2026 · Systems, cryptography and machine learning in C, C++, Python and TypeScript · happyc0der.github.io

## About

I finished my MS in Computer Science at NYU Tandon in May 2026 (GPA 3.67), after a B.Tech in Computer Science and Applied Mathematics at IIIT Delhi. I'm looking for a new-grad role in software engineering, machine learning, security or quantitative research, in New York or remote in the US.

I like building things end to end and then measuring them. Most of my projects ship with tests, CI and numbers a reviewer can check, and I write up what did not work as carefully as what did.

Some recent work:

• mldsa-auth: a post-quantum authentication protocol in C11 (ML-DSA-65 over hybrid X25519 + ML-KEM-768). 0.45 ms handshake, fuzzing, nightly mutation testing, a ProVerif model.
• Atlas: a solo C++23 engine for map-based strategy games. Deterministic lockstep simulation, mods sandboxed in WebAssembly, over 1,000 tests, CI on three platforms.
• LFP2Vec audit: reproduced a NeurIPS 2025 neuroscience model on public data, found why it fails across labs (a preprocessing mismatch) and fixed it with a 100 Hz low-pass filter.
• EEG dementia re-evaluation: re-ran a course project on detecting Alzheimer's and frontotemporal dementia from EEG with subject-level splits and nested cross-validation. Honest accuracy is about 60%, and no deep model beat spectral features.
• DOOMCE and TRENCHFIRE: a first-person raycaster written from scratch for the TI-84 Plus CE calculator, then ported to a Garmin watch and published on the Connect IQ store.
• TideFit: security audit, framework upgrade and production launch of a friend's Next.js app. 15 findings, npm audit from 6 vulnerabilities to 0, tests from 0 to 45.
• ForgeLog: an offline Android gym tracker in Kotlin with no network permission and 830 tests.
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

## Projects (LinkedIn "Projects" section, one entry each; the form has no URL field, so links go at the end of the description)

Written for a reader, not a parser: the first sentence says what the thing is and the main result, then short sentences, then links. Numbers match content/ and the resumes.

### Atlas: C++23 engine for map-based strategy games
Dates: Sep 2026 - present · Skills: C++, Game Engine Development, WebAssembly
A game engine I am building alone in C++23, in 28 gated milestones so far: SDL_GPU renderer, hot-reloading assets, versioned saves and 24 written design decisions.

The simulation is deterministic. It advances in fixed ticks and hashes its state, so a replay, a save or a second machine playing in lockstep over ENet can be checked bit for bit. A million-cell tick runs in 694 microseconds. Mods run as WebAssembly with no clock, filesystem or randomness of their own.

The first game on it is chess, now in its own repository and built against the installed engine: every rule including the draws, and an opponent that is a C mod compiled to WebAssembly.

Over 1,000 tests. CI on macOS, Linux and Windows with sanitizers and benchmark gates.

Code: github.com/happyc0der/atlas-engine
Chess: github.com/happyc0der/atlas-chess

### EEG dementia re-evaluation: Alzheimer's and frontotemporal dementia from EEG
Dates: Sep 2026 · Skills: Machine Learning, PyTorch, Statistics
A re-evaluation of a Spring 2025 NYU Neuroinformatics team project that classified Alzheimer's disease, frontotemporal dementia and healthy controls from resting-state EEG (88 subjects, public OpenNeuro data). The original reported 63.6% on one 18-subject split, after model selection that leaked subjects.

I rebuilt the evaluation so every split is over subjects, with nested model selection, 10 repeats of 5-fold cross-validation, bootstrap confidence intervals and permutation tests. Honest three-class accuracy is about 60% against 33% chance: the best pre-specified model reaches 61.1%.

I then compared 16 feature pipelines with EEG foundation models (LaBraM, CBraMod, BIOT) and CNNs under a plan written before any run. No deep model beat the spectral features. Alzheimer's vs controls reaches 84.6%, but Alzheimer's vs frontotemporal dementia stays near 60% with everything tried. I also found that 92% of each channel's variance in the distributed recordings is one common-mode artefact.

The original model code is my teammates' (mainly Subhrajit Dey's); the re-evaluation is mine.

Code: github.com/happyc0der/eeg-dementia-graph-transformer

### Gemma 4 Developer Agent (Kaggle): LLM agent that fixes GitHub issues
Dates: Sep 2026 - present · Skills: LLM Agents, Python, Docker
My solo entry to the Kaggle Gemma 4 Developer Agent competition: an LLM agent, written in Google ADK, that reads a GitHub issue and produces a fix with Gemma 4 31B.

The organizers had not released their evaluation harness, so I re-implemented it as swelite: Docker sandboxes, the nine agent tools, an ADK YAML compiler and patch verification. 109 of 129 public tasks pass its gold checks.

A 16 GB laptop GPU, reached over SSH, serves a smaller proxy model through vLLM so every prompt change can be tested on a 33-task holdout. Final ranking pending; the competition ends in December 2026.

Code: github.com/happyc0der/gemma-swe-agent

### mldsa-auth: post-quantum authentication protocol in C11
Dates: Sep 2026 · Skills: C, Cryptography, Fuzzing
A mutual authentication and session protocol in C11, designed to resist attacks from quantum computers: ML-DSA-65 signatures (FIPS 204) over a hybrid X25519 + ML-KEM-768 key exchange, with a padded ChaCha20-Poly1305 record layer.

Measured, not estimated: a 0.45 ms median handshake and 736 MiB/s record encryption. Every push runs the tests under ASan and UBSan on Linux and macOS; 12 libFuzzer targets and 192 must-kill mutations run nightly.

On top of it, mldsa-authd: a login service with single-use login codes, device enrolment, revocation, key rotation and recovery codes. The handshake has a ProVerif model.

Code: github.com/happyc0der/mldsa-auth

### Custodian: household recall monitor as an MCP server with its own OAuth 2.1
Dates: Sep 2026 · Skills: TypeScript, OAuth, AWS
An MCP server and app that checks what you own against the CPSC, NHTSA and openFDA recall feeds and tracks home maintenance. Built for the Alexa+ track of Amazon Build, Ship, Shape 2026.

10 tools and 5 screen views. A deterministic matcher writes a reason for every recall it flags. The OAuth 2.1 authorization server is hand-written: client credentials, authorization code with PKCE, ES256 JWTs, rotating refresh tokens, per-method scopes.

Every tool call finishes inside the 500 ms voice budget; tests assert p95 under 100 ms. TypeScript monorepo, 79 tests, AWS CDK stack synthesised in CI.

Code: github.com/happyc0der/custodian

### DOOMCE and TRENCHFIRE: a raycaster for the TI-84 Plus CE and the Garmin Venu X1
Dates: Sep 2026 · Skills: C, Assembly, Embedded Systems
A first-person raycaster written from scratch, twice.

DOOMCE runs on the TI-84 Plus CE graphing calculator in C and eZ80 assembly: about 24 KB, 5 to 7 fps, textured walls, sliding doors and enemies, with every texture and sprite generated at startup. I measured 122 eZ80 cycles per byte of screen memory, fit a frame-time model to it and moved the hottest loop to hand-written assembly.

TRENCHFIRE is the port to the Garmin Venu X1 watch in Monkey C. Rebuilding the renderer around the watch's 0.2 ms per-draw cost took it from 1 to 2 fps to 15.6 fps. It is published on the Garmin Connect IQ store.

Code: github.com/happyc0der/doom-ports
Store: apps.garmin.com/apps/f81aaa08-71a6-4bc2-8faa-716f37a8ad44

### ForgeLog: offline Android gym tracker
Dates: Sep 2026 · Skills: Kotlin, Android Development, Jetpack Compose
An Android app for the gym: build programs, log sets quickly, keep every workout on the phone. It asks for no network permission at all.

Kotlin, Jetpack Compose, Room, Hilt, MVVM. The rest timer shows on the lock screen and survives the process being killed. Analytics for volume, estimated one-rep max and personal bests; JSON backup and CSV export.

830 tests run on the JVM with no device, plus 38 instrumented tests on Android API 26 and 36. Released as a signed 2.3 MB APK.

Code: github.com/happyc0der/ForgeLog

### LFP2Vec audit: reproduction of a NeurIPS 2025 model on public Neuropixels data
Dates: Sep 2026 · Skills: PyTorch, Machine Learning, Neuroscience
I reproduced the fine-tuning stage of LFP2Vec, a NeurIPS 2025 model for brain recordings, on public IBL and Allen Neuropixels data on a laptop: 0.74 ± 0.07 balanced accuracy against the paper's 0.68.

The model collapses when moved between labs. I traced that to a preprocessing mismatch (the spectra diverge up to 768-fold above 300 Hz) and showed that a 100 Hz low-pass filter restores the published margin. I also measured calibration under lab shift, which the paper does not report, and added an electrode-position control.

337 tests, and a leakage check runs before every training run.

Code: github.com/happyc0der/lfp2vec-audit

### TideFit: security audit, Next.js 16 upgrade and production launch
Dates: Sep 2026 · Skills: Application Security, Next.js, TypeScript
TideFit is Utkarsh Mittal's Next.js trip planner for athletes. The audit, the upgrade, the tests, the CI and the launch are my work.

I reviewed all 45 source files and probed the running app, and confirmed 15 vulnerabilities: OAuth callbacks that accepted any authorization code, a database policy that exposed every user's trips, a secret in a plaintext cookie, unmetered paid endpoints. 13 are fixed and verified.

I upgraded Next 14 to 16 and React 18 to 19 by hand across 16 merged pull requests. npm audit went from 6 vulnerabilities to 0 and tests from 0 to 45, with CI that deploys main to Vercel. It is live with private file storage, an edge rate limit, and Strava and Google Calendar sign-in verified end to end.

Live: tide-fit.vercel.app
Code: github.com/UtkarshMitta/tide-fit

### NYC AutoDDG: profiling and describing 100 NYC Open Data datasets
Dates: Sep 2026 · Skills: PySpark, Databricks, pandas
A PySpark profiler that reads each of 100 NYC Open Data datasets once and reports types, statistics, semantic types and data-quality flags: 4.8M rows in 2.3 minutes, down from 12. Every result is checked against a pandas oracle with pytest.

I benchmarked Spark against pandas on an M4 Pro laptop and on Databricks serverless over Parquet inputs. Spark wins past 1.7M rows and scales near-linearly to 8 cores; pandas is 14x faster on small files.

A local qwen3:14b model then wrote a description for each dataset from its profile. 97% of the checkable claims matched the data, and search Recall@1 rose from 0.605 to 0.728.

Code: github.com/happyc0der/nyc-autoddg

### Kaggle 2026: Biohub Cell Tracking, Playground S6E9, TrafficFlowBench
Dates: Sep 2026 - present · Skills: Machine Learning, LightGBM, PyTorch
Three Kaggle competitions this year, all with final rankings pending.

Biohub Cell Tracking: public leaderboard 0.952 on free Kaggle GPU, against 0.947 for the public notebook it builds on. I built an offline harness that runs GPU inference once and re-tunes post-processing locally against the official scorer, and trained a 3D CNN on 134 annotated cell divisions to prune false branches.

Playground S6E9 (EV purchases, ROC AUC): 0.94649 on the public leaderboard against a leader at 0.94674. Nested target encodings, 20-fold cross-validation, a LightGBM, CatBoost and MLP blend, and 192 experiments judged by paired DeLong tests. Label resampling showed a perfect model would score 0.9459 ± 0.0003, so the remaining gap is label noise.

TrafficFlowBench (IEEE Big Data Cup 2026): 0.845 against a 0.553 baseline. LightGBM time-series forecasters trained out of core on 56M rows and an exact NNLS origin-destination solver; one script rebuilds the submission bit for bit.

Code: github.com/happyc0der/kaggle-s6e9-ev-purchases and github.com/happyc0der/trafficflowbench

## Skills (add these, pin the first three)

Python, C++, Machine Learning, C, TypeScript, Kotlin, SQL, R, PyTorch, scikit-learn, LightGBM, Cryptography, Post-Quantum Cryptography, Application Security, Fuzzing, OAuth, Distributed Systems, gRPC, WebAssembly, Android Development, Jetpack Compose, Next.js, React, FastAPI, Node.js, REST APIs, PySpark, Databricks, pandas, PostgreSQL, SQLite, Docker, GitHub Actions, CI/CD, AWS, Linux, Git, Large Language Models (LLM), Backtesting, Econometrics, Time Series Forecasting, Data Analysis, Software Testing, Game Engine Development, Embedded Systems

## Honors and awards

Nothing yet. Add Kaggle placements when the final leaderboards post (Biohub 2026-09-29, S6E9 2026-09-30, TrafficFlowBench 2026-11-06, Gemma 2026-12-02).

## Leave off

The GitHub bio line, the political meme game, the SOVEREIGN job-search tooling, and anything marked "not public" on the site.

## First post (draft, for him to post; not posted by me)

I finished my MS in Computer Science at NYU Tandon in May and I'm looking for a new-grad role in software engineering, machine learning or security, in New York or remote in the US.

While searching I kept building. This year: a post-quantum authentication protocol in C11 with fuzzing and a ProVerif model, a C++23 game engine with a deterministic lockstep simulation, a security audit and production launch of a friend's Next.js app, a raycaster for a graphing calculator that is now on the Garmin watch store, and three Kaggle competitions.

Everything, with code, screenshots and the numbers: happyc0der.github.io

If your team is hiring, or you know one that is, I'd be glad to talk.
