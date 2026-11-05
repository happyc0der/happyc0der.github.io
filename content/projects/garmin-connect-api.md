---
title: garmin-connect-api
blurb: Typed Python library, local HTTP service and MCP server that read and write Garmin Connect, including completed strength sessions; released on PyPI and the official MCP Registry.
repo: https://github.com/happyc0der/garmin-connect-api
year: 2026
order: 21
featured: false
stack: [Python 3.12, FastAPI, FastMCP, pydantic, fit-tool, Typer, python-garminconnect, pytest]
tags: [swe]
stats: ["38 MCP tools, v0.3.2 on PyPI", "487 offline tests", "Linux, macOS, Windows CI"]
bullets:
  - "Read/write layer for Garmin Connect with one typed core and three faces: a Python library, a 43-operation FastAPI service and 38 MCP tools, all but four generated from its routes so the tools cannot drift from the API."
  - "Uploads completed strength sessions, which Garmin's own developer program has never offered, as FIT files with set messages; the file serial is hashed from the session so an identical re-upload is reported as a duplicate, and the upload and later set corrections are verified live on my own account."
  - "487 offline tests against real Garmin payload shapes, the FIT round trip, the 1,527-entry exercise catalog and every MCP tool's output schema, run in CI on Linux, macOS and Windows; released as v0.3.2 on PyPI and the official MCP Registry, and listed in awesome-mcp-servers."
resume_bullets:
  - "Built a typed Python library, FastAPI service and 38 MCP tools for Garmin Connect; all but four tools generate from routes, so they cannot drift."
  - "Shipped uploads of completed strength sessions as FIT files, a write Garmin's developer program never offered; verified live on my own account."
  - "Released v0.3.2 on PyPI and the MCP Registry; 487 offline tests pass in CI on Linux, macOS and Windows, with ruff and mypy clean."
---

Garmin Connect has no public API that a person can use for their own account. The official developer program is for businesses, has been closed to new applicants since spring 2026, and has no endpoint that uploads a finished workout. I built this so I could read and write my own account from Python, from HTTP, or from Claude.

The library returns pydantic models with Garmin's inconsistencies ironed out: weights in kilograms, instants as timezone-aware datetimes, snake_case throughout, and the untouched payload kept on `raw`. `garmin serve` puts 43 operations on localhost with OpenAPI docs. `garmin mcp`, or `uvx garmin-connect-api` from PyPI, turns those same routes into MCP tools with FastMCP, plus four hand-written ones (account status, exercise lookup, recent strength sessions with their sets, a week summary), 38 in all. Raw file downloads and sample-level detail stay off the tool list so they do not flood a context window. Each tool is annotated as reading (24), adding (8) or deleting and overwriting (6), so a client can ask before running the writes, and every argument carries a description.

Reads cover activities with per-set strength detail, laps and pool-swim lengths, daily health, twelve-metric trends over up to two years and named personal records. Writes cover strength, run, ride and swim workouts, completed sessions, set corrections and weigh-ins with body composition.

Logging a completed session is the part nothing official offers. I encode it as a FIT file with set messages and post it to the upload service the Connect website itself uses. The file serial is hashed from the file's own contents, so logging the identical session again is reported as a duplicate rather than added as a second activity. Every write except the raw workout DTO is first validated against the bundled catalog of 1,527 exercises in 47 categories, and an unknown name gets near misses back instead of Garmin's bare 400. The password is typed in exactly one place, `garmin login`; the service and MCP server only read stored tokens and answer 401 without them. Garmin added Cloudflare fingerprinting and per-account rate limits in March 2026, and a run of failed logins can lock an account for a day or more, so nothing here retries a login and a rate limit stops every call path instead of being retried.

This goes through `python-garminconnect` and Garmin's private endpoints, so it is unsanctioned by Garmin's terms and meant for one's own account. I have run it against my real account: reads, the day summary, the MCP tools, the workout create, schedule, unschedule, delete cycle, body composition writes, the completed-session upload, set edits, and a workout push queued for my watch. The first live upload worked but showed what the offline tests could not. Garmin's reply is an asynchronous "accepted" with no id, so the new activity is now found by its exact start instant, and without record messages in the FIT file a connected app dated the session at upload time. After those fixes the upload passed end to end: found, renamed, sets checked, cleaned up.

It is released as v0.3.2 on PyPI, through trusted publishing, and on the official MCP Registry as `io.github.happyc0der/garmin-connect-api`. It is MIT licensed and listed in awesome-mcp-servers. CI runs the 487 offline tests on Linux with Python 3.12, 3.13 and 3.14, on Windows and on macOS, with ruff and mypy clean. Five review rounds followed the first release, each finding reproduced before it was fixed and each fix given a test that fails without it, which took the suite from 231 tests to 479. The latest release fixes a trend summary that treated today's running count as a finished day, reported by an outside user.
