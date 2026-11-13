---
title: CreditMap
blurb: Searches every free source of AI credits, GPU time, hosting and models at once, flags scams and risky offers, and runs itself daily on GitHub Actions for free.
year: 2026
order: 43
featured: false
status: not public
stack: [Python, uv, GitHub Actions, RDAP, pytest]
tags: [swe, data]
stats: ["21 free sources", "22,549 records", "daily run, no secrets needed"]
bullets:
  - "Built a search over 21 free sources (offer catalogs, OpenRouter and models.dev prices, Hugging Face and Ollama, Devpost, Hacker News, Reddit, Lobsters, GitHub, Bluesky, Mastodon, Product Hunt and X posts) that sorts results into likely offers, worth a look and chatter, and pulls out amounts, deadlines, requirements and the provider's domain."
  - "Flags risk instead of hiding it: account generators, leaked keys, cracked tools, crypto airdrops and provider domains registered under 90 days ago (checked with RDAP) are red-flagged and never recommended; relays, top-up \"free\" offers and renewing subscriptions carry cautions."
  - "Runs every day on GitHub Actions with no secrets: tests, all queries, only new finds reported, per-source health alerts, an append-only database of 22,549 records, a dated report and an offline one-file dashboard; leads sent in as GitHub issues are checked against every catalog within minutes."
resume_bullets:
  - "Built a free daily search over 21 free sources for AI credits, GPU time and hosting, ranking offers by requirements such as card or student status."
  - "Red-flagged scams such as leaked keys, account generators and domains under 90 days old, checked with RDAP."
  - "Automated it on GitHub Actions with no secrets: source health alerts, an append-only database and an offline dashboard."
---

I built CreditMap to find free AI credits, GPU time, hosting and models without trusting any one list. One command searches 21 free sources at once: offer catalogs, model and price listings, open hackathons, and community sites from Hacker News to Mastodon, with backups for the sources that rate-limit. Results are sorted into likely offers, worth a look, chatter and policy-excluded, with the amount, period, deadline, requirements (card, student, phone) and the provider's domain pulled out, and a count of how many sources name the same provider. X posts linked from any result are read through X's free embed data with no login.

Every result is treated as an unverified lead and checked for risk. Account generators, leaked or shared keys, cracked tools, crypto airdrops and provider domains registered less than 90 days ago are red-flagged with the reason, never recommended and never cleared later. Riskier but usable offers, such as relays reselling frontier models, top-up "free" credits and subscriptions that renew at a higher price, carry cautions. Fetches are GET-only with a size cap, private and local addresses are blocked on every redirect, and referral and tracking parameters are stripped from links.

A GitHub Actions job runs every morning: the tests, every saved query, a record of new finds only, per-source health that alerts when a source fails twice or suddenly returns nothing, a dated report commented on a digest issue, and a rebuilt offline dashboard that ranks options against rules like free only, no card or student. The database only grows, one record per link, and has 22,549 records so far. A lead sent in as a GitHub issue from a phone is read, matched against every catalog and answered within minutes, and the share of leads no catalog knew is tracked as the miss rate. The repo is private, with 39 offline tests.
