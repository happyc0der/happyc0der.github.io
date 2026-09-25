---
title: GridSentry
blurb: "Post-hackathon audit, fixes, test suite and CI for Utkarsh Mittal's NEPA environmental permit agent (FastAPI and Next.js)."
repo: https://github.com/UtkarshMitta/GridSentry
demo: https://grid-sentry-web.vercel.app
image: /img/gridsentry.png
year: 2026
order: 17
featured: false
credit: "The app is Utkarsh Mittal's (UtkarshMitta on GitHub): the hackathon build and the first 4 commits are his. The post-hackathon audit, the fixes, the test suite, the linting and the CI are mine, as 7 commits plus the merge of PR #1, 8 of the repo's 12."
resume_credit: "App by Utkarsh Mittal; the audit, fixes, test suite and CI (8 of 12 commits) are mine."
stack: [Python, FastAPI, pytest, TypeScript, Next.js 14, Leaflet, GitHub Actions, ruff]
tags: [swe, data]
stats: ["0 to 111 API tests", "25 web, 9 live checks", "PR #1: 48 files"]
bullets:
  - "Audited a hackathon NEPA permit agent against the live federal GIS services for about 17 sites: non-US sites came back as clean, critical habitat was never detected, a dead data service was reported as clean, and two citations were to a nonexistent statute and a rescinded rule."
  - "Fixed the data pipeline, citations and UI in PR #1 (48 files, 3668 additions, 887 deletions), then 7 more bugs in a review pass, including a protected-land query that kept 25 of up to 329 nearby records and could drop the park a site sits in."
  - "Took tests from 0 to 111 offline API tests, 25 web tests and 9 opt-in live checks, added ruff and ESLint, and CI on Python 3.12 and 3.14; the app is live at grid-sentry-web.vercel.app."
resume_bullets:
  - "Audited a NEPA permit agent against live federal GIS services for about 17 sites; found non-US sites reported clean, critical habitat never detected, bad citations."
  - "Fixed the pipeline and UI in PR #1 (48 files, 3668 additions), plus 7 more bugs from a second review pass."
  - "Tests from 0 to 111 offline API tests, 25 web tests and 9 live checks; ruff, ESLint and CI on Python 3.12 and 3.14."
---

GridSentry is Utkarsh Mittal's NEPA environmental permit agent, built at a hackathon. You give it the coordinates of a proposed energy project and it queries federal datasets (USFWS wetlands and species, FEMA flood zones, USGS protected areas), runs three agents (a geolocation analyst, a legal compliance officer and a red-team critic) and writes a cited environmental assessment draft. The app and the hackathon build are his. He added me as a collaborator, and the audit, the fixes, the tests and the CI are mine.

Several claims in the README were not holding, so I ran the real pipeline against the live federal services for about 17 sites, checked every citation and clicked through the UI. London and Mexico came back as low risk with a Categorical Exclusion likely, because the US-only datasets returned nothing. Critical habitat was never detected: IPaC returns populationSid as an object, so the ID match could never succeed. A data service that did not respond was reported as clean. State law was cited even when the jurisdiction had not been verified. Two citations were wrong: 54 U.S.C. § 101905 does not exist and 40 CFR 1501.3 was rescinded on 2025-04-11. The site acreage was a random number seeded from the coordinates.

PR #1 (48 files, 3668 additions, 887 deletions) added a coverage gate for non-US and offshore sites, fixed the habitat match, marks a missing layer NOT ASSESSED so it blocks a Categorical Exclusion, verifies the state with the keyless US Census geocoder, corrects the citations, makes acreage an input, and generalizes geometry so a run stores hundreds of KB instead of 4 to 10 MB. A second review pass found 7 more bugs, among them a protected-land query that kept 25 of 152 to 329 nearby records in arbitrary order and could drop the park the site sits in, and a failed database write that reported a run as complete. Each fix has a regression test that fails on the old code. After the merge I added typed API response models, a run history on the home page, ruff and ESLint, and GitHub Actions CI that runs both suites, both linters, the typecheck and a build on Python 3.12 and 3.14.

Tests went from 0 to 111 offline API tests (parsers on recorded real payloads, gates, report logic, the API and SSE lifecycle), 25 web tests and 9 opt-in checks against the live federal services. The site is live at grid-sentry-web.vercel.app, with the API on Render.
