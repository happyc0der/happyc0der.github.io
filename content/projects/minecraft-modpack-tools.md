---
title: minecraft-modpack-tools
blurb: "Python command-line tool for the jobs big Minecraft modpacks leave you to do by hand: HD texture packs, texture crashes, purple/black items, moving a player to another UUID and finding a world's newest copy."
repo: https://github.com/happyc0der/minecraft-modpack-tools
year: 2026
order: 37
featured: false
stack: [Python, NumPy, SciPy, Pillow, xBRZ, uv, pytest]
tags: [swe]
stats: ["7 subcommands", "Minecraft 1.4.7 to 26.2", "28 test functions"]
bullets:
  - "One command, mcpack, with 7 subcommands: upscale, animated, atlas-fit, item-atlas, player-transfer, worlds and xbrz. Together they were run on real packs and worlds (Minecraft 1.4.7 to 26.2) before being cleaned up for release, and none needs the game to be running."
  - "The texture commands follow eight written rules, each added after it went wrong in a real pack: animation strips scale frame by frame, tiling textures stay seamless, cut-outs stay cut-out, leaves keep their noise, and transparent pixels get bled color so mipmaps don't draw halos."
  - "player-transfer moves a player's inventory, stats, advancements and the UUID references in mod data and chunks to another UUID. It edits NBT only if it round-trips byte for byte, backs up each file before changing it, and has a dry run that lists each changed file."
resume_bullets:
  - "Built mcpack, a Python CLI for modpack textures, resource packs and worlds, run on real packs and worlds from Minecraft 1.4.7 to 26.2."
  - "Wrote a byte-exact NBT and Anvil region parser to move a player's data to another UUID, refusing any file or chunk that would not round-trip."
  - "Simulated how Minecraft 26.x bakes item and block models to find and fix purple/black items; output matched the client log on two real packs."
---

Big Minecraft modpacks leave a lot of jobs to the player, so `mcpack` has a subcommand for each. `upscale` fills in every mod texture an HD pack lacks, `animated` rebuilds animated textures frame by frame, `atlas-fit` fixes the `StitcherException: Unable to fit` start-up crash by shrinking oversized textures, and `item-atlas` finds and fixes the purple/black items resource packs show on 26.x. `player-transfer` moves a player's data to another UUID, and `worlds` finds every copy of every world in folders and backup zips, matched by the seed and name in level.dat. `xbrz` builds the optional xBRZ scaler from pinned, hash-checked source; without it the texture commands use a built-in Scale2x. The tools ship no game assets or pack art.

The eight texture rules are written down with the reason for each. `item-atlas --check` simulates how the game bakes every item and block model and reports the failures the game would log; on two real packs its lists matched the client log exactly. `player-transfer` recognizes UUIDs in five encodings across player files, mod data and chunks, backs up each file before its first change and never deletes the source's files. The 28 test functions build small synthetic packs, jars and worlds, so they need no game files, and CI runs them on Ubuntu and Windows with Python 3.10 and 3.13.

The tool is Apache-2.0.
