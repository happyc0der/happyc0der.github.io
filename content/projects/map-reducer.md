---
title: map-reducer
blurb: MapReduce from scratch in Python over gRPC, running K-Means across separate master, mapper and reducer processes, with two kinds of worker failure handled.
repo: https://github.com/happyc0der/Map_Reducer
year: 2024
order: 24
featured: false
team: 3
credit: "Course team project with adityaahuja7 and deeptanshu (GitHub handles). The September 2026 test suite, launcher and CI are mine."
resume_credit: "Team of three at IIIT Delhi; the 2026 test suite, launcher and CI are mine."
stack: [Python, gRPC, protobuf, unittest, ruff, GitHub Actions]
tags: [swe, data]
stats: ["64 tests", "CI on 3 OSes", "team of 3"]
bullets:
  - "MapReduce framework from scratch in Python over gRPC, with the master, every mapper and every reducer as its own process on its own port, used to run K-Means; the master ships index ranges rather than data, and reducers pull their partitions from the mappers over gRPC."
  - "Handles both failure modes in the spec: a worker that reports a failed task is retried, and a force-stopped worker's split or partition is reassigned to a surviving worker in append mode so it keeps the work it already owns."
  - "64 unittest tests check the distributed result against a from-scratch single-process K-Means to within 1e-6 over four mapper by reducer configurations, and CI runs them on Python 3.10 to 3.13 on Linux plus 3.12 on macOS and Windows, with a separate fault-injection job."
resume_bullets:
  - "MapReduce from scratch in Python over gRPC: master, mappers and reducers as separate processes on their own ports, used to run K-Means."
  - "Handles both spec failure modes: failed tasks retried, a force-stopped worker's partition reassigned to a survivor in append mode."
  - "64 tests compare the distributed result to a single-process K-Means within 1e-6; CI on Python 3.10 to 3.13 across Linux, macOS and Windows."
---

Assignment 3 of CSE530 Distributed Systems at IIIT Delhi, Winter 2024, built with two teammates over four days in April 2024. The master, each mapper and each reducer is a separate process with its own port and its own output directory, and everything between them goes over one gRPC service with four calls: Map, StartReduce, Reduce and returnCentroid.

One iteration works like this. The master splits the input by index range and never ships points. Each mapper reads its range, keys every point to its nearest centroid and writes one partition file per reducer. Each reducer then pulls its partition from every mapper over gRPC, averages each group and returns the new centroids. The loop stops when no centroid moves more than 0.0001 on either axis, or after the requested number of iterations. Failures come in the two shapes the spec asks for. A worker that answers with a failed status (injected at 5 percent per call) is retried until it succeeds. A worker that is gone, so its RPC raises, has its split handed to the next mapper or its partition to a random surviving reducer, which is told to append so it keeps the work it already owns.

The team code is from April 2024. In September 2026 I went back to it for a documentation, lint and dead-code pass, and added what the original never had: a POSIX launcher, a 64-test unittest suite organised around the assignment rubric, and GitHub Actions. The central test replays the same K-Means from the same random starting centroids in a from-scratch single-process implementation and asserts the two agree to within 1e-6, across 1x1, 3x2, 4x3 and 8x2 mapper by reducer configurations. CI runs ruff, the suite on Python 3.10 to 3.13 on Linux plus 3.12 on macOS and Windows, and a fault-injection job that force-stops a mapper and a reducer mid-run. All eight jobs are green on the latest commit, and the fast suite runs in a few seconds on the 25-point sample input.

The README lists what still breaks. An iteration that leaves a centroid with no points ends the run with an IndexError, and a split reassigned after a force-stop can be wiped if the replacement mapper's own Map call has not finished yet. The tests skip rather than fail on the first, and the second is documented as reproducible with a non-zero sleep argument.
