---
title: Ledger
blurb: "Revenue-forecast agent with receipts, built for Block Convey's Money Talks 2 hackathon: every number and buyer quote is checked in code before a finance team sees it."
repo: https://github.com/happyc0der/ledger
demo_embed: /demos/ledger/
demo_label: "The repo's verification code (field rules, quote verifier, consistency checks, scorer) running in Pyodide over the claims Claude Sonnet 5.5 returned in the recorded 2026-10-17 run; no model is called, and any edit you make is checked live."
demo_kind: "Verification code over a recorded run"
demo_height: 760
image: /img/ledger.png
year: 2026
order: 14
featured: false
status: "Hackathon entry, result pending"
stack: [Python, FastAPI, pandas, SQLite, Claude Sonnet 5.5, Gemini, Ollama, PRISM, pytest]
tags: [swe, ml, data]
stats: ["94% recall, 0 of 86 false alarms", "97 to 0 fabrications", "5 models compared"]
bullets:
  - "Solo entry for the Money Operations track of Block Convey's AI x Fintech hackathon Money Talks 2 (2026-10-17): the model fills a fixed claim schema with verbatim buyer quotes, and code compares each claim to the CRM to build a commit and best-case forecast where every excluded dollar has a receipt."
  - "On 235 deals built from the public Maven CRM dataset with 18 planted anomaly types, run through the event's Claude Sonnet 5.5 gateway: Ledger found 94% of the semantic problems at 99% precision with 0 of 86 clean deals flagged and nothing invented, where the same model asked to find the issues found 72% and flagged 10, and the same model as a plain forecaster invented 6 numbers."
  - "Compared five models under one pipeline (Gemini, Sonnet 5.5, Opus 5.5, and local 12B and 14B models): reading recall scales with model size but win-probability judgment does not, while the verification layer kept fabrications and false alarms at zero on every one; every run traced in PRISM, 27 failures logged and 26 fixed, 45 tests."
resume_bullets:
  - "Built Ledger solo for Block Convey's Money Talks 2 hackathon: a forecast agent whose model fills a claim schema with verbatim buyer quotes while code checks each claim against the CRM."
  - "On 235 deals with 18 planted anomaly types (Claude Sonnet 5.5): 94% recall, 0 of 86 clean deals flagged, 0 invented numbers, vs 72%, 10 and 6 for the same model asked directly."
  - "Compared five models: reading recall scaled with model size, judgment did not, and verification held fabrications and false alarms at zero on all; 27 failures logged with evidence, 26 fixed."
---

Ledger is my solo entry for the Money Operations track of Block Convey's AI x Fintech hackathon Money Talks 2, held in New York on 2026-10-17. A finance team signs off a revenue forecast built from a CRM that reps fill in optimistically. Ledger reads the CRM snapshot and every call note and email, and answers per deal with a win probability, the buyer's objection quoted from the record and one next action. The model only reads: it fills a fixed claim schema (budget status, decision timeline, economic buyer, competitor, last promise) with a verbatim quote per slot, and code compares each claim to the CRM fields, including across deals in the same account. A claim without a quote is dropped, and every check shows as a pass or fail receipt in the UI.

The demo company comes from the public Maven Analytics CRM dataset: the 228 open deals of one team, with their real later outcomes hidden from the agent. The source has no text, so I generated call notes conditioned on each deal's real outcome and planted 18 anomaly types, such as a stage that contradicts the buyer, a contact who left the company or a promise that expired. On the resulting 235 deals a CRM-rules baseline finds 0% of the semantic anomalies, the same model asked to list issues finds 32% and falsely flags 15 of 86 clean deals, and Ledger finds 92% at 100% precision with 0 clean deals flagged. Against the real outcomes, the naive v1 captured 60% of the closable revenue in its top 20 and fabricated 97 amounts, day gaps or quotes; v3 captures 77% and fabricates none. Objection and next-action accuracy (82% to 94%, 87% to 92%) are scored against labels I planted, so I read them as a check that the model hears the buyer, not as independent truth.

On the day, the event required model calls through the Nicrron gateway, so the whole benchmark was re-run on Claude Sonnet 5.5 with no prompt changes: Ledger found 94% of the semantic anomalies at 99% precision with 0 of 86 clean deals flagged and no fabrications, against 72% and 10 false alarms for the same model asked to list issues, and 6 invented numbers for the naive v1 forecaster on the same model. The same pipeline on Opus 5.5 and on local gemma4:12b and qwen3:14b models showed that reading recall scales with the model while win-probability judgment does not, and that the verification layer holds fabrications and false alarms at zero on every model.

Every model call and agent run is traced in PRISM, the sponsor's observability tool. Its PII guardrail flagged phone numbers in v1 traces that do not exist in the data; the local model I used to paraphrase the notes had invented them. That failure and 26 others, each with its evidence and attribution and all but one with a fix, are in FINDINGS.md, and a deterministic auditor now re-finds them without ground truth. No prompt or model setting was changed after seeing results; the fixes were comparison bugs and label gaps, all listed.

The rest is built for a weekly loop: run history in SQLite, a lifecycle per finding, draft CRM updates a person approves before export, per-rep digests, HubSpot and Salesforce ingest presets, and a FastAPI page with a receipt beside every claim. 45 tests pass with no model calls. The code is public; the hackathon result is not yet announced.
