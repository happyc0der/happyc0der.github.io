---
title: One-time-pad allocation
blurb: "Wait-free one-time-pad allocation for m broadcasting parties, with a proof of no reuse and an exact waste bound that does not grow with the pool."
repo: https://github.com/happyc0der/cryptography-project-1
year: 2025
order: 18
featured: false
team: 3
credit: "NYU CS6903/4783 Project 1 with Aaron Wu and Shuhua. The October 2025 version is the team's static-partition baseline. The chunk-reserve protocol, the proofs, the adversarial simulator, the tests, CI and the report are from my September 2026 rewrite."
stack: [Python, pytest, ruff, GitHub Actions]
tags: [sec, swe]
stats: ["36 vs 4,000 wasted pads", "310 tests", "0 blocked sends"]
bullets:
  - "Designed a wait-free one-time-pad allocation protocol for m broadcasting parties with up to d messages in flight, with a proof that no pad is ever reused and an exact worst-case waste of d(2m-1) - m + (n mod d) pads, independent of the pool size n."
  - "Cut worst-case waste in the evaluation grid at m=5, d=5, n=5,000 from 4,000 pads under the static-partition baseline to 36, with zero blocked sends in every cell of that grid, where each cell is the worst case over 4 delivery orders, 2 network pressures and 3 seeds."
  - "Found two defects in the course handout's own two-party protocol, an off-by-one gap check and a pointer view that can move backwards under out-of-order delivery, each pinned by a test; 310 tests and CI that reruns the evaluation and diffs the committed results."
resume_bullets:
  - "Wait-free one-time-pad allocation for m broadcasting parties with d messages in flight; proof of no reuse, exact worst-case waste d(2m-1) - m + (n mod d)."
  - "Worst-case waste at m=5, d=5, n=5,000 cut from 4,000 pads (static partition) to 36, with zero blocked sends across the adversarial grid."
  - "Found two defects in the course handout's own two-party protocol, each pinned by a test; 310 tests, CI reruns the evaluation and diffs the results."
---

m parties share n one-time pads. Every message is broadcast to all the others at the same instant, at most d messages are undelivered at any moment, and nobody takes turns. No pad may ever be used twice, and when the pads run out as few as possible should be stranded. The obvious answer, a fixed slice of the pads per party, is trivially secret, but a party can only spend its own slice, so one talkative party strands 4,000 of 5,000 pads at m=5. That static partition was the team's October 2025 version of this project, with a simulator that never modelled delivery delay.

In September 2026 I replaced it with chunk-reserve. Pads are grouped into chunks of d. Each party has a private current chunk and a public reserve chunk, and everyone replays one rule over the delivered history: when a delivered message from party j uses a pad inside reserve[j], reserve[j] moves to the next chunk that has never been assigned. Delivery is simultaneous, so the delivered history is common knowledge and every party computes the same reserve map with no requests, grants or acknowledgements. The reserve map is a partition of the chunks, which gives secrecy with no timing assumption at all. A chunk size of exactly d gives wait-freedom, and d-1 does not. Worst-case waste is d(2m-1) - m + (n mod d), an equality rather than a ceiling: the worst schedule is a party that sends once and then goes quiet, which none of the first five schedules in the grid produced. They reported 20 wasted pads at m=5, d=5; the one_shot schedule reaches 36, and it stays 36 at n=5,000, 20,000 and 80,000. The proved bound there is 40; the last d-1 pads need the draining party to stop mid-chunk too, which no schedule can express, so a unit test constructs that case directly.

The simulator is built to be unkind: four delivery orders including one that holds back the message each party is waiting on, a lazy mode that keeps the backlog at the full d, and both readings of the d bound. Every pad handed out is checked against every pad before it, so a completed run is a proof of no reuse for that schedule, and a deliberately broken protocol confirms the check fires. The 310 tests run in about 8 seconds. CI runs them on Python 3.11 to 3.13, lints, and diffs the committed 180-cell summary.csv against a fresh run of the evaluation, so a protocol change that was never re-evaluated fails the build. Implementing the handout's two-party protocol as a reference turned up two defects in it: the gap check is off by one, and taking the newest arrival at face value lets a party's view of the other's pointer move backwards under LIFO delivery.

A second protocol, GrantProtocol, covers the weaker model where a sender gets no feedback about its own messages; it matched chunk-reserve on waste under the first five schedules, strands 56 pads to chunk-reserve's 36 under one_shot at m=5, d=5, and pays for its round trips in stalls. The 15-page report in the repo has the proofs, the evaluation and the limits: the (m-1)d optimality argument covers only the case where m-1 parties are silent from the start, and everything is simulated in one process rather than distributed.
