---
title: Assembler and Simulator
blurb: "Assembler and cycle-by-cycle simulator for a 16-bit teaching ISA, a three-person Computer Organization assignment at IIIT Delhi in which I wrote the simulator."
repo: https://github.com/adityaahuja7/Assembler-Simulator
year: 2021
order: 28
featured: false
team: 3
credit: "Aditya Ahuja's repository (adityaahuja7 on GitHub), a Computer Organization assignment with Aditya Ahuja and Vedant Gupta. Vedant wrote the assembler. The simulator is mine: I added its first version and 309 of its 430 lines by blame, 8 of the repo's 39 commits under my happyc0der and KeshavIIITD accounts, and Aditya and Vedant fixed 9 lines after that."
stack: [Python, bash]
tags: [swe]
stats: ["20 opcodes", "256 x 16-bit words", "14 of 14 grader tests"]
bullets:
  - "Wrote the Python simulator for the course's 16-bit ISA: 20 opcodes, registers R0 to R6 plus FLAGS, 256 words of memory, and a trace line of program counter, registers and flags after every instruction followed by a memory dump."
  - "The course grader passes all 14 assembler and simulator tests (5 simple and 2 hard for each) and rejects the 4 error programs, rerun in September 2026 on Python 3.14 for 20 of 20 marks on each half."
resume_bullets:
  - "Wrote the Python simulator for a 16-bit teaching ISA: 20 opcodes, 7 registers plus FLAGS, 256 words of memory, per-instruction trace and memory dump."
  - "Three-person Computer Organization assignment at IIIT Delhi; the course grader passes all 14 assembler and simulator tests, 20 of 20 marks each."
---

This was the Computer Organization assignment at IIIT Delhi in August 2021, done in Aditya Ahuja's repository with Aditya and Vedant Gupta. The course fixed the instruction set: 16-bit words, a 5-bit opcode, 20 instructions, registers R0 to R6 plus a FLAGS register, 256 words of memory, and both programs reading stdin and writing stdout. The assembler turns assembly text into binary words and the simulator runs those words. Vedant wrote the assembler, which rejects 16 kinds of error (undefined variables and labels, variables declared after code, a repeated or misplaced hlt, illegal immediates, misuse of FLAGS). The simulator is my part. My two commits to the assembler are comments.

I wrote the simulator between 18 and 21 August 2021, 309 of its 430 lines by blame. It loads the binary into memory until it reads the halt word, then loops: fetch the word at the program counter, take the top 5 bits as the opcode, run the handler, and print one line with the 8-bit program counter, the seven registers and the flags, all in binary. Add, sub and mul set the overflow flag when a result leaves 16 bits; cmp sets the less-than, greater-than or equal flag; the three conditional jumps read the flag from the previous cmp and then clear it. After hlt it dumps all 256 memory words.

The repo ships the course's grader: 5 simple and 2 hard programs each for the assembler (assembly in, binary out) and the simulator (binary in, trace out), plus 4 error programs the assembler must reject. Rerun in September 2026 on Python 3.14, every test passes, 20 of 20 marks on each half. To be exact about the share: at my last commit the simulator matched 1 of the 7 traces, and Vedant's and Aditya's later commits changed 9 lines (among them a memory word initialised with 15 zeros instead of 16, the ld instruction, and when flags reset) to reach 7 of 7. One rough edge remains: the file still calls the matplotlib scatter plot at exit with the import commented out, so it ends with a NameError after the memory dump. The grader reads only stdout, so the trace is unaffected.
