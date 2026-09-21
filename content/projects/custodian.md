---
title: Custodian
blurb: Household inventory that watches product recalls, for Alexa+ over MCP.
repo: https://github.com/happyc0der/custodian
year: 2026
order: 6
featured: true
stack: [TypeScript, MCP, OAuth 2.1, Preact, AWS CDK, DynamoDB, Bedrock]
tags: [swe, sec]
stats: ["10 MCP tools", "78 tests", "< 500 ms per call"]
bullets:
  - "MCP server and Alexa+ add-on that checks a household inventory against CPSC, NHTSA and FDA recall feeds. Built for Amazon Build, Ship, Shape 2026."
  - "Wrote the OAuth 2.1 authorization server: PKCE S256, rotating refresh tokens."
  - "TypeScript monorepo on AWS CDK (App Runner, DynamoDB); 10 tools, 78 tests, tool calls inside a 500 ms budget."
---

You tell it what you own. It keeps checking CPSC, NHTSA and openFDA for recalls, reminds you about smoke-detector batteries and car-seat expiry, and answers hands-free on an Echo Show.

Fuzzy matches between a recall and an item go to Claude on Bedrock only when the text score is ambiguous.
