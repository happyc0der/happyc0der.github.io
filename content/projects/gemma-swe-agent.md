---
title: Gemma 4 SWE agent
blurb: "Solo Kaggle SWE-agent entry: my own Google ADK agent, a harness re-implementation written before the organizers released theirs, and a faithful offline eval."
repo: https://github.com/happyc0der/gemma-swe-agent
year: 2026
order: 8
featured: true
status: in progress
credit: "Since 2026-10-21 the daily base is a public bundle, Budget-Fit, by Kaggle user verracodeguacas (Apache 2.0). The swelite harness, the offline eval and prompts through v6.0 are mine."
resume_credit: ""   # the first resume bullet carries the credit, so the PDF needs no separate line
stack: [Python, Google ADK, vLLM, llama.cpp, LiteLLM, Docker, Gemma 4, Tailscale, Kaggle API]
tags: [ml, swe]
stats: ["109/129 gold checks", "own agent best public score 0.12", "$0 cloud spend"]
bullets:
  - "Kaggle Gemma 4 Developer Agent competition (solo; ends 2026-12-02, final ranking pending): a Google ADK agent that fixes GitHub issues with Gemma 4 31B, scoring 0.00 on the first two days, then 0.06 to 0.12 over 20 scored submissions through 2026-10-20 (best 0.12, 7 of 58 public tasks, first on 2026-10-10). Since 2026-10-21 the daily base is a public bundle, Budget-Fit (Apache 2.0, by Kaggle user verracodeguacas); its best, 0.18 on 2026-10-26, is the bundle's, not my agent's."
  - "swelite, a re-implementation of the organizers' evaluation harness written before they released theirs on 2026-09-25 (Docker sandboxes, the 9 fixed tools, ADK YAML compiler with skills, multi-pass patch verification, failure-taxonomy analyzer), validated with gold and null checks on all 129 public tasks: 109 pass, 0 pass unfixed."
  - "Faithful offline eval at $0: the organizers' harness patched so its sandbox behaves like the scorer's (gold 33/33, no patch 0/33), the real 31B via llama.cpp on Kaggle T4x2, a 33-task holdout; prompt v5.8 solved 14/33 vs 13/33 for v5.0n, a gap inside run-to-run noise. An earlier 12B proxy on a 16 GB laptop GPU showed that ADK never compacts context inside a task and that temperature 0.7 cut identical retries from 13.5 to 5.1 per task."
resume_bullets:
  - "Built an LLM agent in Google ADK that fixes GitHub issues with Gemma 4 31B (Kaggle; since Oct 21 on a credited public bundle; final ranking pending)."
  - "Wrote swelite, re-implementing the organizers' eval harness before its release (Docker sandboxes, ADK YAML compiler); 109 of 129 gold checks pass."
  - "Patched the organizers' sandbox to match the scorer's; ran the 31B via llama.cpp on Kaggle T4x2; prompt v5.8 solved 14/33 vs 13/33, within noise."
---

The competition asks for a declarative Google ADK agent config (YAML, prompts, skills, optional LoRA adapters) that turns `gemma-4-31b-it-qat-w4a16-ct` into an agent that fixes real GitHub issues offline. Scoring runs on about 120 hidden tasks from private repos on 4x L4 GPUs, with 12 hours for the whole set and one submission a day. I entered solo with a $0 cloud budget, Kaggle's free GPU hours only.

The organizers' evaluator was unreleased when I started, so I re-implemented it from their spec as `swelite`: Docker and subprocess sandboxes, the 9 tools with the same JSON contracts and truncation caps, a sandboxed YAML compiler with include directives and ADK skills, the nudge loop, multi-pass patch verification and an analyzer that sorts failures into buckets. Gold and null checks on all 129 public tasks give 109 pass and 0 pass unfixed (2 on the native x86_64 box); the 20 residual gold failures are environment differences, listed per repo in `docs/harness-fidelity.md`. The organizers released theirs on 2026-09-25; config checks have run on the official code since 2026-09-26, and that document lists the differences between the two.

The 31B model's roughly 17 GB of weights do not fit my laptop's 16 GB GPU, so that laptop served Gemma 4 12B through vLLM 0.30 as a proxy. I set it up over SSH and Tailscale: WSL2, Docker, vLLM fitted into 16 GB, and Task Scheduler for jobs that survive SSH logoff. Runs are logged under `experiments/` with a config snapshot, per-task results and notes.

Two findings drove the prompt. ADK's context compaction never fires inside a task, so trajectories die at the 32k window after about 20 full-size tool outputs. Temperature 0.2 makes the model retry failed calls verbatim; 0.7 cut identical repeats from 13.5 to 5.1 per task. The proxy holdout went from 6/33 to 7/33 with a prompt written around a context budget.

My first runs of the real 31B on Kaggle's T4s could not judge prompts: thinking was effectively on and FastAPI tasks ran against the wrong Pydantic. So on 2026-10-03 I patched the organizers' own harness so its sandbox behaves like the scorer's, a clean Python 3.13 venv built from the competition wheels. On the 33-task holdout, gold patches pass 33/33 and no patch passes 0/33. The real 31B then runs through the official Evaluator, served by llama.cpp (Q4_0) on Kaggle's free T4x2, with thinking off and time budgets scaled by 3 for T4 speed. Prompt v5.8 solved 14/33 against 13/33 for v5.0n, the first result above that baseline, and v6.0 tied it at 14/33. A one-task gap is inside the noise: an identical rerun of one config moved from 9/33 to 12/33.

The first two daily submissions scored 0.00 on the public leaderboard, and the cause was never pinned down. From 2026-09-27 my configs scored between 0.06 and 0.12 over 20 scored submissions through 2026-10-20. My own agent's best is 0.12, 7 of the 58 public tasks, first reached on 2026-10-10 with prompt v5.0n and reached again with v5.8 on 2026-10-20.

Since 2026-10-21 the daily base is not my agent. It is a public bundle, Budget-Fit (Apache 2.0, by Kaggle user verracodeguacas, credited in `experiments/variants/pub-budget-fit.CREDIT.md`), which I switched to because public runs of its files solved 8 to 11 of 58 tasks against about 6 for my configs. Its best public score is 0.18 (11/58), first on 2026-10-26, and its seven scored runs average 9.71 of 58. Those are the bundle's scores, not my agent's. A candidate that added one bullet of mine to the base scored 8 and 7 of 58, below the base's mean, so I dropped it. The offline eval cannot judge the bundle as it runs: T4 speed forces thinking off and the bundle runs with thinking on. With thinking off it solved 9/33, and 12/33 on a rerun, below v5.8's 14/33, which is the reverse of the leaderboard order.

A paper-track write-up is in draft, due 2026-11-12. The competition closes 2026-12-02; final ranking pending.
