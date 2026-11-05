---
title: "The Farmer Was Replaced: Fastest Reset"
blurb: "A script that plays the programming game The Farmer Was Replaced from an empty 1x1 farm to the Leaderboard unlock: 44:39.8 on Steam's Fastest Reset board, rank 39 of 4,409 on 2026-11-04."
year: 2026
order: 36
featured: false
status: code not public
stack: [Python, The Farmer Was Replaced]
tags: [swe]
stats: ["44:39.8 Fastest Reset", "rank 39 of 4,409 on 2026-11-04", "63:16 to 44:23 in sandbox"]
bullets:
  - "One script plays the whole Fastest Reset category: a single drone on a 1x1 farm builds up hay, wood, carrots, sunflower power and pumpkins, then mazes, cactus and dinosaurs, ending on a 16x16 farm with 16 drones, until 1,000,000 gold and 2,000,000 bones buy the Leaderboard unlock."
  - "Timed each change in the game's own simulate() sandbox, which starts from the same state as a Fastest Reset run, with unlock costs and grow times measured by in-game get_cost() and timing probes."
  - "Cut the time from 63:16 for the first working version to a 44:23 average on three sandbox seeds; the last steps were watering new plants and a leaner dinosaur loop (409 to 384 s). Steam score 44:39.8, rank 39 of 4,409 on 2026-11-04."
resume_bullets:
  - "Scripted the programming game The Farmer Was Replaced to its Leaderboard unlock; rank 39 of 4,409 on Steam's Fastest Reset board on 2026-11-04."
  - "Cut the full run from 63:16 to a 44:23 average by timing each change across seeds in the game's own simulate() sandbox."
  - "Compared build orders in the sandbox using unlock costs and grow times probed in-game with get_cost() and timing runs."
---

The Farmer Was Replaced is a farming game you play by programming a drone in a Python-like language. Its Fastest Reset leaderboard times a program from a fresh start, an empty 1x1 farm and one drone, to the Leaderboard unlock, which costs 1,000,000 gold and 2,000,000 bones. The script is one file. A single drone farms hay, wood and carrots, buys speed and a bigger farm, and powers itself with sunflowers; pumpkins then make the weird substance for mazes, whose gold buys more drones; the endgame runs 16 drones on a 16x16 farm, sorting cactus, playing the dinosaur for bones and solving mazes for gold.

Each change was timed in the game's own simulate() sandbox, which starts from the same state as a Fastest Reset run. Unlock costs and grow times were measured with in-game get_cost() and timing probes. Runs are deterministic per seed, but a small code change can shift a run by 30 to 50 s either way, so versions were mostly compared on two or three seeds and only large effects were kept. The first working version took 63:16; the current one averages 44:23 on three seeds, after watering new plants and a leaner dinosaur loop that took that phase from 409 to 384 s. The Steam score comes from the game's own leaderboard_run(), which repeats the run on new seeds for at least two hours of game time and scores the average: 44:39.8, rank 39 of 4,409 on 2026-11-04. Polyculture first, more drones earlier and a 22x22 farm all came out break-even or slower, so going under 30 minutes needs a different idea, most likely in the opening. The code is not public.
