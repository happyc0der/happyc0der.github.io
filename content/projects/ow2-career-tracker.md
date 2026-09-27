---
title: OW2 Career Tracker
blurb: "Personal Overwatch 2 dashboard that snapshots my public career profile every three hours and charts every hero's stats over time."
repo: https://github.com/happyc0der/ow2-career-tracker
image: /img/ow2-career-tracker.png
year: 2026
order: 22.5
featured: false
stack: [Python, FastAPI, SQLite, httpx, JavaScript, Chart.js, uv]
tags: [swe, data]
stats: ["snapshot every 3 h", "stores only changes", "per-hero history"]
bullets:
  - "Blizzard's career profile only shows current lifetime totals, so the tracker builds history itself: a scheduled sync pulls the profile through the OverFast API and stores a new point in SQLite only when a stat actually changed."
  - "A FastAPI server and a plain HTML, CSS and Chart.js front end show the player banner and rank, headline stats, win rate and KDA over time, the role split and every hero's detail tables, for Quick Play and Competitive."
  - "One command runs it with uv; a Windows installer registers a silent scheduled task every three hours and a Start menu entry, with cron for macOS and Linux."
---

A personal dashboard for my Overwatch 2 account. The public career profile exposes lifetime totals per hero and per mode, not match history, so "over time" only exists if something saves snapshots. `owdash sync` fetches the profile, compares it with the last snapshot and writes a point only when something changed, which keeps the database small. `owdash serve` syncs once and opens the dashboard: player banner with endorsement and competitive rank, headline stats with changes since tracking started, win rate and KDA over time, the tank, damage and support split, and a sortable hero roster with each hero's full stat tables.
