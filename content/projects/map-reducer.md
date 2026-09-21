---
title: MapReduce from scratch
blurb: MapReduce over gRPC, running K-Means, with worker failure handling.
repo: https://github.com/happyc0der/Map_Reducer
year: 2024
order: 12
featured: false
team: 3
stack: [Python, gRPC, protobuf]
tags: [data, swe]
stats: ["64 tests", "gRPC", "team of 3"]
bullets:
  - "MapReduce framework from scratch over gRPC: master, mapper and reducer processes; used to run K-Means."
  - "Reassigns tasks when a worker fails; 64 tests."
---

Distributed Systems coursework at IIIT Delhi, with two teammates. Each mapper and reducer is its own process on its own port. The master notices failures and hands the task to someone else.
