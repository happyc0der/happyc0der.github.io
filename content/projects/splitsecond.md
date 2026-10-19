---
title: Split/Second PC fixes
blurb: "Wireless Xbox controllers, Xbox button names and 60 FPS for a 2010 PC racing game, by proxying its DirectInput and patching it in memory."
repo: https://github.com/happyc0der/SplitSecond-PadFix
year: 2026
order: 12.7
featured: false
credit: "SplitSecond-HFR is preseznik's native 60 FPS mod; my fork adds support for the community DLC build (the address profile, a loader fix and a large-address-aware tool). PadFix and ButtonNames are mine."
stack: [C++, Win32, DirectInput, XInput, x86 reverse engineering, CMake, Python]
tags: [swe, sec]
stats: ["drop-in DirectInput proxy", "22 prompts renamed in memory", "60 FPS on the DLC build"]
bullets:
  - "Found why modern Xbox controllers fail in Split/Second (2010): it reads input only through DirectInput, a Bluetooth pad reports a different HID layout, and it picks default controls by exact product ID, so an Elite Series 2 (045E:0B22) got no bindings at all."
  - "Wrote PadFix, a drop-in dinput8.dll proxy in C++ that presents any Microsoft pad as a wired Xbox 360 controller and answers the game's reads from XInput; it also renames the game's 22 DirectInput prompt names in memory, pausing the game's threads to re-check and write each match in well under a millisecond."
  - "Ported a community 60 FPS mod to a second build of the game: mapped every hooked address from runtime memory dumps of the copy-protected exe, checked each patch against the expected original bytes, and held 59.8 to 60.1 FPS in 209 of 223 five-second windows over a 19-minute session."
---

Split/Second only understands a wired Xbox 360 pad. Connect a current Xbox controller over Bluetooth and the game either reads it wrong or reads it and ignores every press. Three things stack up: the game reads buttons and sticks only through DirectInput (its single XInput import is for rumble), a Bluetooth Xbox controller has a different DirectInput layout from the wired 360 one, and the game hands out default controls by comparing the device's product ID with a hard-coded table, so anything not on it gets no bindings.

[PadFix](https://github.com/happyc0der/SplitSecond-PadFix) is a `dinput8.dll` the game loads from its own folder. It forwards everything to the system DirectInput except Microsoft controllers, which it reports as a wired Xbox 360 pad and whose state it builds from XInput in the exact wired layout, honouring the ranges and dead zones the game sets. A second DLL forwards the game's old `xinput1_3` rumble calls to the modern XInput. The prompts used to read "PRESS Button 1" and "TAP Axis Z Pos TO DRIFT"; PadFix finds the game's English text table once it has loaded and renames the 22 entries in place. Stale copies of that table sit in freed memory that the game can reuse at any moment, so it searches read-only, pauses the game's other threads, checks each match again, writes and resumes. An offline test plants a copy of the table and checks the rename over 100+ runs. [ButtonNames](https://github.com/happyc0der/SplitSecond-ButtonNames) is the same rename done on disk, with a byte-identical restore.

[SplitSecond-HFR](https://github.com/happyc0der/SplitSecond-HFR) is preseznik's mod that runs the game's loop at a real 60 Hz. It only knew the Steam exe, and the community DLC build is a different compile with every address moved and its code encrypted on disk. I mapped the hooked functions, the frame limiter and the AI update from memory dumps of both builds, instruction by instruction, into a per-build profile; every patch is still checked against the original bytes before it is written. That build's loader also dereferences what the hook returns, which crashed in the graphics driver until the hook returned a small holder object. After two long-session crashes ran out of the 2 GB a 32-bit program gets, a script sets the large-address-aware bit so Windows gives it 4 GB.

All three are early and were tested on one PC with one controller. Split-screen with two real pads, rumble, Steam Input and Linux are untested, and whether the 4 GB fix ends every long-session crash isn't proven yet. Each README lists what was tested, what wasn't, and what to send in a bug report. GPL-3.0; no game files are included.
