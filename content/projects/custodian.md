---
title: Custodian
blurb: "Household inventory that watches CPSC, NHTSA and FDA recalls, served as an MCP server with its own OAuth 2.1 server for Alexa+ and Claude."
repo: https://github.com/happyc0der/custodian
image: /img/custodian.png
year: 2026
order: 7
featured: true
stack: [TypeScript, MCP, OAuth 2.1, Express, Preact, AWS CDK, DynamoDB, Bedrock]
tags: [swe, sec]
stats: ["10 MCP tools", "79 tests", "p95 under 100 ms"]
bullets:
  - "Self-hosted MCP server plus MCP App that checks a household inventory against the CPSC, NHTSA and openFDA recall feeds and tracks home maintenance: 10 tools, 5 screen views, and a deterministic matcher that writes a reason for every match; built for the Alexa+ track of Amazon Build, Ship, Shape 2026."
  - "Wrote the two-tier OAuth 2.1 authorization server by hand to fit the Alexa+ account-linking shape: client_credentials for service calls, authorization_code with PKCE S256 for household calls, ES256 JWTs, single-use codes, rotating 180-day refresh tokens and scope gating per JSON-RPC method, all covered end to end by tests."
  - "Kept every tool call inside the 500 ms Alexa+ voice budget by moving all network and model calls into an hourly sweeper (tests assert p95 under 100 ms per tool through the real HTTP stack), in a TypeScript monorepo with file and single-table DynamoDB stores under one contract suite, 79 vitest tests on recorded feed fixtures, and a CDK stack synthesised in CI."
resume_bullets:
  - "Self-hosted MCP server and MCP App that checks a household inventory against CPSC, NHTSA and openFDA recalls; Amazon Build, Ship, Shape 2026 (Alexa+)."
  - "Hand-written two-tier OAuth 2.1 server: client_credentials and authorization_code with PKCE S256, ES256 JWTs, rotating refresh tokens, per-method scopes."
  - "Every tool call inside the 500 ms Alexa+ budget by moving network and model calls to an hourly sweeper; tests assert p95 under 100 ms; 79 tests."
---

You tell it what you own, a car seat, the minivan, the smoke detectors. It keeps checking the public CPSC, NHTSA and openFDA recall feeds, tracks the small things that keep a home safe (smoke-detector batteries, filters, car-seat expiry, vehicle service, warranties), and answers in one or two spoken sentences with the remedy included. It runs as a self-hosted MCP server over Streamable HTTP, so it works from Claude, an Echo Show running Alexa+, or a script, and it ships a Preact MCP App that draws recall cards, a recall detail page, the household briefing, the maintenance timeline and the inventory when the host has a screen.

Matching is deterministic and every match carries a written reason. Candidates come from a MiniSearch index over titles, products and keywords; brand, model and distinctive-word overlap are weighted, a score of 0.5 records a match and 0.8 is spoken as definite. Keywords come from the record body rather than the title, because the CPSC feed has a record whose title belongs to a different recall, which the tests now pin with a recorded fixture. When Claude on Bedrock is enabled it adjudicates only the 0.5 to 0.8 band, and the verdict is cached on the match so it is never re-asked.

Alexa+ allows 500 ms per tool call, so no tool handler does network I/O or calls a model. All of that runs in a sweeper, hourly and right after add_item returns. The OAuth 2.1 authorization server is my own because voice assistants need a two-tier shape (client credentials for service calls, PKCE for household calls, no dynamic client registration, no WWW-Authenticate challenge) that generic MCP auth libraries do not produce.

I built it in September 2026 (the commits run from 2026-09-12 to 2026-09-23) for the Alexa+ track of Amazon Build, Ship, Shape 2026. The add-on itself was not submitted: the Alexa CLI is distributed through a private AWS CodeArtifact repository that needs an AWS account, which I do not have, so the repo stands as a portfolio piece. What I learned about the toolkit and the feeds is in docs/platform-notes.md. The screenshots were rendered with the reference MCP Apps basic-host against live recall data.
