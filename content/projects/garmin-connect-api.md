---
title: garmin-connect-api
blurb: Typed Python library, local HTTP service and MCP server that read and write Garmin Connect, including uploads of completed strength sessions.
year: 2026
order: 21
featured: false
status: in progress
stack: [Python 3.12, FastAPI, FastMCP, pydantic, fit-tool, Typer, python-garminconnect, pytest]
tags: [swe]
stats: ["37 HTTP operations", "35 MCP tools", "67 tests, no network"]
bullets:
  - "Read/write layer for Garmin Connect with one typed core and three faces: a Python library, a 37-operation FastAPI service, and 35 MCP tools, all but four generated from its routes so the tools cannot drift from the API."
  - "Uploads completed strength sessions, which Garmin's own developer programme has never offered, by encoding them as FIT files with set messages; the file serial is derived from the session so a repeat upload should land as a duplicate rather than a second activity, though the upload path has not yet been run against a live account."
  - "67 offline tests against real Garmin payload shapes, the FIT round trip and the 1,527-entry exercise catalogue; ruff and mypy clean; the password is typed only at the CLI and the service and MCP server only ever read stored tokens."
resume_bullets:
  - "Read/write layer for Garmin Connect: typed Python library, 37-operation FastAPI service and 35 MCP tools generated from its routes so they cannot drift."
  - "Uploads completed strength sessions as FIT files with set messages, which Garmin's developer programme has never offered; upload not yet run live."
  - "67 offline tests against real payload shapes, the FIT round trip and a 1,527-entry exercise catalogue; ruff and mypy clean."
---

Garmin Connect has no public API that a person can use for their own account. The official developer programme is for businesses, has been closed to new applicants since spring 2026, and has no endpoint that uploads a finished workout. I built this so I could read and write my own account from Python, from HTTP, or from Claude.

The library returns pydantic models with Garmin's inconsistencies ironed out: weights in kilograms, instants as timezone-aware datetimes, snake_case throughout, and the untouched payload kept on `raw`. `garmin serve` puts 37 operations on localhost with OpenAPI docs. `garmin mcp` turns those same routes into MCP tools with FastMCP, plus four hand-written ones (account status, exercise lookup, recent strength sessions with their sets, a week summary). Raw file downloads and sample-level detail stay off the tool list so they do not flood a context window.

Logging a completed session is the part nothing official offers. I encode it as a FIT file with set messages and post it to the upload service the Connect website itself uses. Every write is first validated against the bundled catalogue of 1,527 exercises in 47 categories, and an unknown name gets near misses back instead of Garmin's bare 400. The password is typed in exactly one place, `garmin login`; the service and MCP server only read stored tokens and answer 401 without them. Garmin added Cloudflare fingerprinting and per-account rate limits in March 2026, and a run of failed logins can lock an account for a day or more, so nothing here retries a login and a 429 is surfaced rather than swallowed.

This goes through `python-garminconnect` and Garmin's private endpoints, so it is unsanctioned by Garmin's terms and meant for one's own account. Reads, the day summary, the MCP tools and the workout create, schedule, unschedule, delete cycle are verified against my real account. The completed-session upload is covered by the FIT codec tests but I have not yet run it live. Still in progress.
