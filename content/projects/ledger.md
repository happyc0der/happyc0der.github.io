---
title: ledger
blurb: CRM pipeline-review agent whose every number and quote is checked in code before a manager sees it.
image: /img/ledger.png
year: 2026
order: 14
featured: false
status: not yet public
stack: [Python, FastAPI, pandas, SQLite, Gemini Flash-Lite, Ollama, PRISM, pytest]
tags: [swe, ml, data]
stats: ["92% semantic recall", "0 of 86 false alarms", "97 to 0 fabrications"]
bullets:
  - "Pipeline-review agent for the Revenue Intelligence track of Block Convey's AI x GTM Hackathon: the model fills a fixed claim schema with verbatim buyer quotes, and code compares each claim to the CRM, including across deals in one account."
  - "On 235 deals with 18 planted anomaly types, 92% semantic recall at 100% precision and 0 of 86 clean deals flagged, where the same model asked to list issues scored 32% recall and flagged 15 of 86."
  - "From the naive v1 to v3, revenue captured in the agent's top 20 rose from 60% to 77% of what real outcomes allowed, fabricated amounts, day gaps and quotes fell from 97 to 0, and every model call is traced in PRISM."
resume_bullets:
  - "Pipeline-review agent for Block Convey's AI x GTM Hackathon: the model fills a claim schema with verbatim buyer quotes; code checks each claim against the CRM."
  - "On 235 deals with 18 planted anomaly types: 92% semantic recall at 100% precision, 0 of 86 clean deals flagged, vs 32% recall for the same model asked directly."
  - "From v1 to v3, top-20 revenue captured rose from 60% to 77% of what outcomes allowed and fabricated figures fell from 97 to 0; every call traced in PRISM."
---

Ledger is my solo entry for the Revenue Intelligence track of Block Convey's AI x GTM Hackathon, a one-day build in New York on 2026-10-17. A sales manager asks what the team should work on this week. Ledger reads the CRM snapshot and every call note and email, and answers per deal with a win probability, the buyer's objection quoted from the record and one next action. The model only reads: it fills a fixed claim schema (budget status, decision timeline, economic buyer, competitor, last promise) with a verbatim quote per slot, and code compares each claim to the CRM fields, including across deals in the same account. A claim without a quote is dropped, and every check shows as a pass or fail receipt in the UI.

The demo company comes from the public Maven Analytics CRM dataset: the 228 open deals of one team, with their real later outcomes hidden from the agent. The source has no text, so I generated call notes conditioned on each deal's real outcome and planted 18 anomaly types, such as a stage that contradicts the buyer, a contact who left the company or a promise that expired. On the resulting 235 deals a CRM-rules baseline finds 0% of the semantic anomalies, the same model asked to list issues finds 32% and falsely flags 15 of 86 clean deals, and Ledger finds 92% at 100% precision with 0 clean deals flagged. Against the real outcomes, the naive v1 captured 60% of the closable revenue in its top 20 and fabricated 97 amounts, day gaps or quotes; v3 captures 77% and fabricates none. Objection and next-action accuracy (82% to 94%, 87% to 92%) are scored against labels I planted, so I read them as a check that the model hears the buyer, not as independent truth.

Every model call and agent run is traced in PRISM, the sponsor's observability tool. Its PII guardrail flagged phone numbers in v1 traces that do not exist in the data; the local model I used to paraphrase the notes had invented them. That failure and 12 others, each with its evidence and attribution and all but one with a fix, are in FINDINGS.md, and a deterministic auditor now re-finds them without ground truth. No prompt or model setting was changed after seeing results; the fixes were comparison bugs and label gaps, all listed.

The rest is built for a weekly loop: run history in SQLite, a lifecycle per finding, draft CRM updates a person approves before export, per-rep digests, HubSpot and Salesforce ingest presets, and a FastAPI page with a receipt beside every claim. 32 tests pass. Inference defaults to a local Ollama model; the full comparison ran on Gemini Flash-Lite. The code is not yet public.
