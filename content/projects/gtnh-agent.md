---
title: gtnh-agent
blurb: "Safety-first agent that plays the Minecraft modpack GregTech: New Horizons on a private server: a local model decides and plans, and code checks every action before it runs and verifies it after."
repo: https://github.com/happyc0der/gtnh-agent
year: 2026
order: 12.5
featured: false
status: in progress
stack: [TypeScript, Node.js, Ollama, qwen3:14b, Zod, SQLite, Vitest]
tags: [ml, swe]
stats: ["3 quests finished on a live server", "23 allowlisted actions", "92 test files"]
bullets:
  - "An agent that plays GregTech: New Horizons (Minecraft 1.7.10) on a private test server the way a person does: it explores, gathers, digs, shelters for the night, eats, crafts and turns in quests, and has finished the first three quests of the Stone Age chapter."
  - "A local model (qwen3:14b on Ollama) decides at decision points and plans from a route that code calculates; code expands each step into checked actions, enforces the safety policy, executes, and verifies each result against the server's own updates. The models only propose; they never act."
  - "Only 23 action types exist, each off until switched on and fenced to a play area; unknown or stale state pauses the agent. It joins through its own 1.7.10 Forge client because Mineflayer cannot join the modpack, and 92 test files run against a fake server."
---

GregTech: New Horizons is one of the longest Minecraft modpacks, and its quest book is a natural benchmark: the 92 quests of the "Tier 0 - Stone Age" chapter plus 14 it needs from other chapters, counted only as the server records them.

Each cycle observes the world through the agent's own client into a schema-validated game state in which anything unobservable is explicitly unknown. A pure-code safety policy decides whether that state is trustworthy and pauses if it is not. A deterministic router, or the local model at decision points, picks one bounded decision, which becomes exactly one allowlisted action. A single executor validates the action, runs it with a token only it can mint, re-observes, checks a postcondition derived in code, and logs the outcome to SQLite.

The safety defaults are strict: localhost or private addresses only, a 256-block boundary, retreat below 10 health, at most two failures per action per task, digging limited to listed natural blocks and placing limited to listed plain blocks. `halt` stops every action at once. Built from 27 September 2026 and in progress; it is working on the fourth quest.
