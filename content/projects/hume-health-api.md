---
title: hume-health-api
blurb: Unofficial Python library, local HTTP service and MCP server for my own Hume Health account, with a bridge that brings Body Pod weigh-ins into Garmin Connect with their full body composition.
year: 2026
order: 45
featured: false
status: not public
stack: [Python, FastAPI, FastMCP, Firebase, Firestore, FIT, pytest]
tags: [swe, data]
stats: ["11 MCP tools", "40 offline tests", "units checked on 35 weigh-ins"]
bullets:
  - "Built an unofficial typed client for my own Hume Health account, which has no public API, with the same three faces as garmin-connect-api: a Python library, a FastAPI service and an MCP server generated from its routes (11 tools), so a route and its tool cannot drift apart."
  - "Bridged Body Pod weigh-ins into Garmin Connect as FIT weight-scale files, the format Garmin's own scales use, so body fat, water, skeletal muscle, bone mass, BMR and visceral fat arrive with the weight; the phone health hubs and relay apps carry weight alone."
  - "Made it safe for a health record: a dry run by default, sending refused until the units were checked against 35 real weigh-ins, readings stuck on Hume's 8.0% body-fat floor skipped with the reason, a local ledger so each weigh-in is sent once, and a stop on any Garmin rate limit."
resume_bullets:
  - "Built an unofficial Python client, FastAPI service and 11-tool MCP server for my own Hume Health account."
  - "Bridged smart-scale weigh-ins into Garmin Connect as FIT files, keeping full body composition that relay apps drop."
  - "Checked units against 35 real weigh-ins before allowing any send, and skipped readings stuck on the device's body-fat floor."
---

Hume has no public API and no Garmin integration, and the phone health hubs cannot carry it either: Garmin writes to Apple Health and Health Connect but never reads from them, and the relay apps that do reach Garmin carry weight alone. hume-health-api reads my own Hume account through the same Google Firebase endpoints the Hume app uses. That makes it unofficial; Hume does not document or support it, and it is meant only for my own data. The password is typed once at a terminal, exchanged for tokens on the spot and never written anywhere.

It reads every weigh-in field (up to 97 per reading, all available raw), trends over a period, the profile with push tokens left out, and any other collection by name. Like its sibling garmin-connect-api, a typed library is the API, a FastAPI service wraps it, and the MCP server is generated from that service: 10 tools from the routes plus a status tool, and the server tells the model to show the sync plan before sending anything.

The Garmin bridge sends each weigh-in as a FIT weight-scale file so Garmin shows the body composition, not just the weight. The mapping was checked on 19 October 2026 against 35 real weigh-ins: fat mass equals weight times body fat, the water compartments add up, BMI implies the same height every time, and one day's weight matched a weigh-in Garmin already held. Hume's "physicalAge" equals body fat exactly on all 38 readings checked, so it is never sent as metabolic age. Readings sitting on Hume's 8.0% body-fat floor are skipped, because on a real account each had 14 to 19% a day or two either side. Sending is a dry run by default, a ledger records what has gone, and sending the same weigh-in three times live confirmed Garmin keeps one entry. 40 tests run against a fake Firebase and Firestore with no network or account.
