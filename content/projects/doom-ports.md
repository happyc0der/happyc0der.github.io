---
title: doom-ports
blurb: "DOOMCE and TRENCHFIRE: one from-scratch raycaster for a TI-84 Plus CE calculator and a Garmin Venu X1 watch."
repo: https://github.com/happyc0der/doom-ports
image: /img/doom-ports.png
demo: https://apps.garmin.com/apps/f81aaa08-71a6-4bc2-8faa-716f37a8ad44
year: 2026
order: 4
featured: true
stack: [C, eZ80 assembly, Monkey C, Connect IQ SDK, CEdev, SDL2, libmtp, Python]
tags: [swe]
stats: ["24 KB, 5-7 fps on eZ80", "1-2 fps to 15.6 fps", "on the Connect IQ store"]
bullets:
  - "From-scratch first-person raycaster for the TI-84 Plus CE in C and eZ80 assembly, about 24 KB at 5 to 7 fps: textured walls, variable floor and ceiling heights, sliding doors, state-machine enemies, dodgeable projectiles, all art generated at startup."
  - "Measured that one VRAM byte write costs about 122 eZ80 cycles, fit a frame-time model to it (ceiling about 6.2 fps for a full 320 by 200 view), and moved the column fill to hand-written assembly."
  - "Ported it to the Garmin Venu X1 in Monkey C, micro-benchmarked the watch (about 0.2 ms per bitmap draw whatever its size) and rebuilt the renderer around call count: 1 to 2 fps to 20 fps still and 15.6 fps moving; on the Connect IQ store."
resume_bullets:
  - "From-scratch first-person raycaster for the TI-84 Plus CE in C and eZ80 assembly: 24 KB, 5 to 7 fps, all art generated at startup."
  - "Measured 122 eZ80 cycles per VRAM byte, fit a frame-time model (ceiling 6.2 fps) and moved the column fill to hand-written assembly."
  - "Garmin Venu X1 port in Monkey C, rebuilt around a 0.2 ms per-draw cost: 1 to 2 fps to 15.6 fps; on the Connect IQ store."
---

The engine is original. Textured walls, floors and ceilings at different heights, sliding doors, soldiers with a state-machine AI, projectiles you can sidestep, pickups and a status bar. Every texture and sprite is generated at startup by code in the repository, so there are no game assets to ship. It shares a genre and a pun with a well-known shooter and nothing else, which is why the watch version carries a different name.

On the calculator the limit is painted area, not instruction count. I measured one byte written to VRAM at about 122 cycles, which puts a hard ceiling of about 6.2 fps on a full 320 by 200 view, and on the eZ80 a multiply, shift, and or xor on a 24-bit int compiles to a function call. So the work was Bresenham stepping instead of fixed point, pointer walks instead of 2D indexing, lookup tables instead of multiplies, and an assembly loop for the column fill. A host build compiles the same `main.c` against stub headers, so the renderer can be profiled and played under SDL2 on a laptop.

The watch has the opposite shape. Its own micro-benchmarks showed that a bitmap draw costs about 0.2 ms whatever its size, a rectangle fill about 0.12 ms, bitmap draws are hardware-scaled, and one interpreted loop iteration is about 24 µs, so the renderer had to minimise calls rather than pixels. Each wall face is one `drawScaledBitmap` of a 1 by 32 texture column, sprites are prebuilt palette bitmaps shaded with `setPalette`, adjacent floor fills are merged, the wall pass is cached offscreen once the view holds still, and the game logic runs while the GPU is still drawing the walls. Startup is split into about 140 small tasks so the watchdog does not kill it.

The Venu X1 is MTP-only over USB and macOS has no MTP support, so I wrote a small libmtp pusher and a script that pulls the on-device profile log. The port requests no permissions, makes no network calls and is free. GPL-3.0-or-later.
