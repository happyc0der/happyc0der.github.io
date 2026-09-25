---
title: ephys-mcp
blurb: MCP server for read-only analysis of spike-level brain-computer-interface recordings.
repo: https://github.com/happyc0der/ephys-mcp
image: /img/ephys-mcp.png
year: 2026
order: 13
featured: false
stack: [Python, MCP, numpy, scipy, pynwb, spikeinterface, matplotlib, GitHub Actions]
tags: [swe, ml]
stats: ["24 tools, 5 sources", "PyPI + MCP Registry", "52 tests, CI"]
bullets:
  - "Python MCP server that lets an LLM analyse intracortical, spike-level brain-computer-interface recordings: 24 read-only tools over synthetic, local NWB, WAV, live Lab Streaming Layer and DANDI Archive sources, released as v0.5.1 on PyPI and the official MCP Registry."
  - "Covers signal quality, threshold spike detection, firing rates, ridge and Kalman decoders scored on held-out data, trial-aligned PSTHs, geometry-aware spike sorting through spikeinterface, FALCON-style cross-session evaluation and GPFA written from the paper's equations in numpy and scipy, with figures returned inline as PNG."
  - "Reference results on public data: ridge R² 0.50 for hand velocity on MC_Maze_Small, and on FALCON H1 a decoder that scores 0.43 on its own day and 0.07 one week later; 52 tests, 51 of them run with ruff in CI, a token-gated HTTP transport, no bundled third-party data and a CC0 licence."
resume_bullets:
  - "Python MCP server for spike-level BCI recordings: 24 read-only tools over synthetic, NWB, WAV, Lab Streaming Layer and DANDI sources; v0.5.1 on PyPI."
  - "Spike detection, ridge and Kalman decoders scored on held-out data, PSTHs, spike sorting via spikeinterface, FALCON-style cross-session evaluation, GPFA in numpy."
  - "Ridge decodes hand velocity at R² 0.50 on MC_Maze_Small; on FALCON H1 0.43 same day and 0.07 a week later; 52 tests, token-gated HTTP."
---

The BCI MCP servers I found target scalp EEG. I built one for the data a high-channel-count implant produces. An LLM opens a session from a local NWB file, a folder of WAV clips, a live Lab Streaming Layer stream, or an NWB file streamed from the DANDI Archive by HTTP range requests, then works through 24 tools that return summaries and figures rather than raw arrays, so results fit in a context window. A synthetic motor-cortex source with ground truth makes the analysis testable offline, and a stub documents what a live implant adapter would need once a vendor publishes an API.

The analysis side covers signal quality, threshold spike detection with precision and recall against ground truth, firing rates, ridge and Kalman decoders, trial-aligned PSTHs, spike sorting through spikeinterface's built-in sorters, GPFA and PCA latent factors, and probe geometry. Decoder hyperparameters are chosen by blocked cross-validation inside the training split. Datasets that record only during trials have their gaps tracked and left out of rates and decoding instead of being read as silence. Sorting uses the probe geometry, so on a simulated 20 µm probe it finds the 12 real units where treating contacts independently reports 15.

On MC_Maze_Small (DANDI 000140, 142 units) ridge decodes hand velocity at R² 0.50 and Kalman at 0.34. On FALCON H1 (DANDI 000954, 176 channels) a ridge decoder trained on the first held-in day scores 0.43 on that day's minival split, 0.07 one week later and below zero on the held-out days, which is the decay the benchmark exists to measure. On the simulator, whose true latent is 2-D cursor velocity, GPFA finds two dominant factors that explain velocity with R² 0.95 against 0.68 for PCA. The decoders are simple causal linear baselines, not state of the art, and FALCON's test labels are private, so none of them is a leaderboard score.

The source contract has no write, stimulate or configure method, and none will be added without a separate safety design. The server runs on stdio with no telemetry; HTTP is opt-in, refuses to bind off loopback without a bearer token, and the README says to put TLS in front of it. No third-party data is bundled and every adapter returns the dataset's licence and citation. Of the 52 tests, 51 run offline with ruff in GitHub Actions and one streams a real file from DANDI on demand. Published under CC0 as `io.github.happyc0der/ephys-mcp`; research software, not a medical device.
