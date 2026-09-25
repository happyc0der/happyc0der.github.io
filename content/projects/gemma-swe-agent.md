---
title: Gemma 4 SWE agent
blurb: Solo Kaggle SWE-agent entry, in progress, built on a re-implementation of the organizers' unreleased evaluation harness.
repo: https://github.com/happyc0der/gemma-swe-agent
year: 2026
order: 8
featured: true
status: in progress
stack: [Python, Google ADK, vLLM, LiteLLM, Docker, Gemma 4, Tailscale, Kaggle API]
tags: [ml, swe]
stats: ["109/129 gold checks", "7/33 proxy holdout", "$0 cloud spend"]
bullets:
  - "Kaggle Gemma 4 Developer Agent competition (solo, in progress): a declarative Google ADK agent that fixes GitHub issues with Gemma 4 31B, submitted daily; two submissions so far, both 0.00 on the public leaderboard, final ranking pending."
  - "swelite, a re-implementation of the organizers' unreleased evaluation harness (Docker sandboxes, the 9 fixed tools, ADK YAML compiler with skills, multi-pass patch verification, failure-taxonomy analyzer), validated with gold and null checks on all 129 public tasks: 109 pass, 0 pass unfixed."
  - "Provisioned a 16 GB laptop GPU over SSH as a vLLM proxy box and ran 33-task holdouts per prompt change (best 7/33); found that ADK never compacts context inside a task and that temperature 0.7 cut identical retries from 13.5 to 5.1 per task."
resume_bullets:
  - "Kaggle Gemma 4 Developer Agent (solo, in progress): an LLM agent in declarative Google ADK that fixes GitHub issues with Gemma 4 31B; final ranking pending."
  - "swelite, a re-implementation of the organizers' unreleased evaluation harness (Docker sandboxes, 9 tools, ADK YAML compiler): 109 of 129 public tasks pass gold checks."
  - "A 16 GB laptop GPU over SSH serves the vLLM proxy; found ADK never compacts context mid-task; temperature 0.7 cut identical retries from 13.5 to 5.1."
---

The competition asks for a declarative Google ADK agent config (YAML, prompts, skills, optional LoRA adapters) that turns `gemma-4-31b-it-qat-w4a16-ct` into an agent that fixes real GitHub issues offline. Scoring runs on about 120 hidden tasks from private repos on 4x L4 GPUs, with 12 hours for the whole set and one submission a day. I entered solo with a $0 cloud budget, Kaggle's free GPU hours only.

The organizers' evaluator is unreleased, so I re-implemented it from their spec as `swelite`: Docker and subprocess sandboxes, the 9 tools with the same JSON contracts and truncation caps, a sandboxed YAML compiler with include directives and ADK skills, the nudge loop, multi-pass patch verification and an analyzer that sorts failures into buckets. Gold and null checks on all 129 public tasks give 109 pass and 0 pass unfixed (2 on the native x86_64 box); the 20 residual gold failures are environment differences, listed per repo in `docs/harness-fidelity.md`.

The 31B model's roughly 17 GB of weights do not fit my laptop's 16 GB GPU, so that laptop serves Gemma 4 12B through vLLM 0.30 as a proxy. I set it up over SSH and Tailscale: WSL2, Docker, vLLM fitted into 16 GB, and Task Scheduler for jobs that survive SSH logoff. Runs are logged under `experiments/` with a config snapshot, per-task results and notes.

Two findings drove the prompt. ADK's context compaction never fires inside a task, so trajectories die at the 32k window after about 20 full-size tool outputs. Temperature 0.2 makes the model retry failed calls verbatim; 0.7 cut identical repeats from 13.5 to 5.1 per task. The holdout went from 6/33 to 7/33 with a prompt written around a context budget. Two Kaggle submissions so far, both 0.00 on the public leaderboard, while the same config solved 6/33 on the proxy; the next submission tests a shorter per-task budget against the 12 hour global cap. The competition closes 2026-12-02; final ranking pending.
