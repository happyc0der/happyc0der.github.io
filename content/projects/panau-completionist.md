---
title: panau-completionist
blurb: "Windows tools for getting Just Cause 2 (Steam, PC) to 100%: a best-of-both save merge, a real-time arrow overlay to every remaining collectible and sabotage target, a save audit and a 16-byte crash fix. Single-player only."
repo: https://github.com/happyc0der/panau-completionist
year: 2026
order: 38
featured: false
stack: [Python, ctypes, Win32 API, tkinter, x86 disassembly, unittest, uv]
tags: [swe]
stats: ["2,524 collectibles", "3,568 sabotage targets", "16-byte crash patch"]
bullets:
  - "The merge combines two saves, taking every collectible, destroyed object, settlement, race, black market unlock and stat either one has, then recounts the tallies the game keeps but never recomputes. A read-only audit checks that a save holds the best of other saves."
  - "The overlay reads loaded objective markers and pickups from memory 5 times a second, plus the in-memory progress table and newest save for anything farther away, and draws arrows to whichever of 2,524 collectibles (white) and 3,568 sabotage targets (red) remain in range."
  - "The overlay, the optional cheats (infinite health and ammo) and the wingsuit mod installer unlock once the newest save shows the story finished on Hardcore, or by setting panau config unlock always."
resume_bullets:
  - "Reverse-engineered Just Cause 2's single-player save format to merge two saves into the best of both and recount tallies the game never recomputes."
  - "Built a real-time overlay that reads game memory to point at whichever of 2,524 collectibles and 3,568 sabotage targets remain."
  - "Wrote a 16-byte patch that adds a null check to the getter behind a crash at JustCause2.exe+0x209D00, with backup and restore of the exe."
---

A set of Python tools (version 1.4.0, Python 3.10+, no other dependencies) for finishing Just Cause 2 on Steam. It is Windows only and for single-player use. A `panau` command merges two saves, audits the result, runs the overlay and cheats, installs or removes a wingsuit mod from a zip you download (the mods are other people's work and are not included), and applies the crash fix. A Steam launch option starts the overlay and cheats with the game once they are unlocked. Faction items such as skulls and black boxes get no arrows, since the game's own map already shows them.

A save is a stream of sections plus a section table at 0x200 that the game uses to find each one. The merge rebuilds that table whenever a section changes size, because a stale table makes the game silently reset parts of the save, and a save that does not round-trip byte for byte is refused. Progress is a 23,833-slot hash table of (type, object) keys with one bit each; the bit means something different per type, so a data file records which value means done. An edited save is tested by the game's own next autosave, written right after loading, where any rejected change shows up. Missions and faction progress stay the base save's by default. Nothing is injected into the game: apart from the cheats' two values the tools only read its memory, and the overlay and cheats refuse a build whose code does not match known bytes. The crash fix rewrites a 10-byte getter using the 6 bytes of padding after it, and Steam's file verification undoes it. The repo has 8 unit tests, 2 of which need real save files.
