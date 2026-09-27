---
title: Raft with leader leases
blurb: "Raft consensus key-value store with leader leases in Python and gRPC, from a distributed systems course; my part was the leader lease, and in 2026 I fixed six bugs and got it running on current gRPC."
repo: https://github.com/happyc0der/raft-leader-lease-kv
year: 2024
order: 27
featured: false
team: 3
status: "Course project 2024, maintained 2026"
credit: "The team was Aditya Ahuja, Deeptanshu Barman and me, for CSE530 at IIIT Delhi in 2024; the repository is my fork of Aditya's Raft-Implementation with the full history. Aditya wrote the node, the election, the client handling and request forwarding. Deeptanshu wrote the replication and commit logic, the lease timers and the metadata class. My 2024 part was the leader lease and the first per-node dump and metadata files. The 2026 maintenance, the bug fixes, the smoke test and the README are mine."
resume_credit: "Team of three (2024); the leader lease and the 2026 fixes and maintenance are mine."
stack: [Python, gRPC, Protocol Buffers, Google Cloud]
tags: [swe]
stats: ["5-node cluster", "8 s leader lease", "6 bugs fixed in 2026"]
bullets:
  - "Added leader leases to a team Raft implementation in Python and gRPC: the leader renews its lease (8 seconds in the final code) when its heartbeats reach a majority of the cluster and steps down when it expires, and followers hold off elections while a lease is live."
  - "Added a leaseDuration field to the RequestVote response next to the existing one on AppendEntries, and made the leader refuse GET and SET while it holds no lease."
  - "In 2026 made it run on current grpcio and protobuf and fixed six bugs: votes from earlier terms counted in later elections, a step-down that could never run, majority checks that left out the leader, a voter that did not reset its timer, an int-vs-string term comparison, and log repair that recursed once per missing entry until a follower 500 entries behind hit the recursion limit; added an end-to-end cluster smoke test."
resume_bullets:
  - "Added leader leases to a team Raft implementation (Python, gRPC): 8 s lease renewed on majority heartbeat, followers defer elections while it is live."
  - "Added a lease field to the RequestVote response and lease-gated reads and writes: the leader refuses GET and SET when it holds no lease."
  - "Fixed six consensus bugs in 2026, including stale-term votes, majority checks that left out the leader, and recursive log repair that crashed followers 500 entries behind."
---

Raft with leader leases is a course project for CSE530 Distributed Systems at IIIT Delhi in 2024, with Aditya Ahuja and Deeptanshu Barman. It started in Aditya's repository. It is a Raft cluster in Python: five nodes talk over gRPC using the two Raft RPCs, RequestVote and AppendEntries, plus a serveClient RPC that takes GET and SET commands from a small command line client and forwards them to the leader. Each node keeps its log, a metadata file (term, commit length, vote) and a dump file on disk, so a restarted node picks up where it left off. The election timeout is drawn from 5 to 11 seconds and the leader sends a heartbeat once a second. The cluster was deployed on five Google Cloud VMs.

My part was the leader lease, the idea from YugabyteDB that lets a leader answer reads without a round trip to the followers. The leader renews its lease each time its heartbeats reach a majority of the cluster and steps down to follower when the lease timer fires. My commit set the lease to 3 seconds and Deeptanshu raised it to 8 the same day. Followers learn the lease duration from AppendEntries and do not start an election while the lease is live. The RequestVote response carries a lease duration so that a winning candidate can wait out the old leader's lease before it serves. GET and SET are refused with a message while the leader has no lease. For this I added the lease field on the RequestVote response to the proto, the lease state and its start, renew and timeout handlers in the node, and the lease checks in the client path. The AppendEntries lease field and the timer class were already there from Deeptanshu.

I also added the first version of the per-node dump and metadata files, writing a line for each election timeout, vote granted or denied, lease expiry and step-down, accepted or rejected AppendEntries and failed RPC. Deeptanshu then moved the metadata into its own class. My share is small: 3 of 45 commits, on 30 and 31 March 2024. Aditya and Deeptanshu wrote the election, replication and client code around it.

In September 2026 I forked it to my own account and made it run again: current protobuf rejects `True` in an int32 field, which broke every vote, so the stubs are regenerated and `voteGranted` is a bool. The cluster addresses and data directory are configurable. I fixed six bugs: votes from earlier terms were counted in later elections, the step-down on a higher-term vote reply could never run, majority checks did not count the leader, a voter did not reset its election timer after granting a vote, a log-conflict check compared an int term with a string, and log repair recursed once per missing entry, so a follower about 500 entries behind hit Python's recursion limit and heartbeats to it failed until it caught up. The leader now repairs in a loop. RPCs have deadlines, a busy-wait loop is gone, and `scripts/demo_cluster.py` runs an end-to-end smoke test of a whole cluster.
