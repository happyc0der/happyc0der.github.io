---
title: Portfolio Pulse
blurb: "Portfolio monitoring for venture funds, built at NYC's Deal Flow VC hackathon: fixed rules turn akta.pro news into ranked signals, and code drops any drafted fact without a citation."
repo: https://github.com/happyc0der/portfolio-pulse-app
demo: https://portfolio-pulse-portfolio-mo-193e.ninoo.app
image: /img/portfolio-pulse.png
year: 2026
order: 39
featured: false
status: "Hackathon entry, did not win"
credit: "Team entry with Utkarsh Mittal."
stack: [Python, FastAPI, React, TypeScript, Vite, Tailwind, Claude Opus 5.5, akta.pro, PRISM, Roundtable, Ninoo Builder, pytest]
tags: [swe, ml, data]
stats: ["142 companies, 358 signals", "About 45 s to add a fund", "75 backend tests"]
bullets:
  - "Team entry for Track 3 (Portfolio) of Deal Flow, NYC's first VC hackathon, at Betaworks on 2026-10-24: pulls 90 days of akta.pro news for each portfolio company and maps event tags to a category, a severity from 1 to 3 and a suggested move with fixed rules, so the model never decides severity."
  - "Ranks companies by a pulse score (severity summed with a 90-day half-life) and lists recent severity 3 signals under \"Needs your attention\"; at 2:51 PM ET on the day the live app held 142 companies across four funds, 358 signals and 7 items needing attention, and a fund added by name had news in about 45 seconds."
  - "Claude Opus 5.5 drafts partner notes, founder emails and LP updates from numbered sources, and a validator drops any fact with no citation or a citation to a source the model was not given; nothing sends itself. 75 backend tests pass, and three QA agents tested the live app as a user, as a skeptical VC and on funds added live."
resume_bullets:
  - "Built Portfolio Pulse with Utkarsh Mittal at the Deal Flow VC hackathon: fixed rules turn akta.pro news into signals with a severity and suggested move."
  - "Ranked portfolio companies by a recency-weighted pulse score; the live app held 142 companies and 358 signals on the day of the event."
  - "Enforced citations in Claude Opus 5.5 partner notes, founder emails and LP updates with a validator that drops uncited facts; 75 backend tests pass."
---

Portfolio Pulse is a team entry for Track 3 (Portfolio) of Deal Flow, NYC's first VC hackathon, held at Betaworks on 2026-10-24. A fund's companies are in the news every week, but nobody reads all of it, and once a quarter someone rebuilds the story by hand for the LP letter. Pick a fund and the app pulls the last 90 days of akta.pro news for each company, turns every article into a signal and shows what needs a partner's attention today.

The signals come from fixed rules, not a model. akta.pro's event tags map to a category (Funding, People, Product, Corporate, Risk), a severity from 1 to 3 and a suggested move, and headcount data adds leading indicators for a six-month drop of 5% or more or growth of 20% or more. A news story reaches severity 3 only if it is reported news that names the company in the headline, and repeat reports of one story within seven days merge into one signal. Companies are ranked by a pulse score, the sum of severity halving every 90 days, and "Needs your attention" lists severity 3 signals from the last 30 days at companies that have not exited.

Claude Opus 5.5, called through Nicrron, drafts a three-bullet partner note, a short founder email or a quarterly LP update from numbered sources. Before anything reaches the screen, a validator drops any fact with no citation and any citation to a source the model was not given, and keeps questions and offers to the founder. PRISM records one trace per draft and LP update, and Roundtable carries the handoff between the agent that watches signals and the one that files drafts. Nothing sends itself: every output is a draft for a person to read, edit and send.

At 2:51 PM ET on the day, the live app held 142 companies across four funds, 86 of them with news, 358 signals from the last 90 days and 7 items in "Needs your attention". A fund added by name went from the search box to a fund page with news in about 45 seconds (25 companies of 485 on record). 75 backend tests pass, and three QA agents tested the live app as a user, as a skeptical VC and on funds added live; their findings drove the final triage and reliability fixes. Portfolio Pulse did not win at Deal Flow. The judge said the project was good and that it reports signals but does not help manage the fund, so positions, marks and fund metrics are next on the [roadmap](https://github.com/happyc0der/portfolio-pulse-app/issues/1). The write-up is on [Devpost](https://devpost.com/software/portfolio-pulse-zufqo1) and the demo video is on [YouTube](https://www.youtube.com/watch?v=wEgW44s1ndU).
