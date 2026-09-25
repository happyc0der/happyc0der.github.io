---
title: Raft with leader leases
blurb: "Raft consensus in Python and gRPC for a distributed systems course, where my part was the leader lease and the per-node event log."
repo: https://github.com/adityaahuja7/Raft-Implementation
year: 2024
order: 27
featured: false
team: 3
status: "Finished April 2024"
credit: "The repository is Aditya Ahuja's (adityaahuja7 on GitHub) and the team was Aditya Ahuja, Deeptanshu Barman and me, for CSE530 at IIIT Delhi. Aditya wrote the node, the election, the client handling and the cloud deployment. Deeptanshu wrote the log replication handlers, the parallel vote requests and the metadata class. Mine are 3 of 45 commits: the leader lease (the lease field on the RequestVote response, the lease state and its start, renew and timeout handlers, lease-gated reads and writes, step-down on expiry) and the first version of the per-node dump and metadata files."
stack: [Python, gRPC, Protocol Buffers, Google Cloud]
tags: [swe]
stats: ["5-node cluster", "8 s leader lease", "3 of 45 commits"]
bullets:
  - "Added leader leases to a team Raft implementation in Python and gRPC: the leader renews its lease (8 seconds in the final code) when its heartbeats reach a majority of the cluster and steps down when it expires, and followers hold off elections while a lease is live."
  - "Added a leaseDuration field to the RequestVote response next to the existing one on AppendEntries, and made the leader refuse GET and SET while it holds no lease."
  - "Added per-node dump and metadata files that record election timeouts, votes, step-downs, rejected AppendEntries and failed RPCs, so a run of the 5-node cluster can be read back afterwards."
resume_bullets:
  - "Added leader leases to a team Raft implementation (Python, gRPC): 8 s lease renewed on majority heartbeat, followers defer elections while it is live."
  - "Added a lease field to the RequestVote response and lease-gated reads and writes: the leader refuses GET and SET when it holds no lease."
  - "Added per-node dump and metadata files that record elections, votes, step-downs and failed RPCs, so a 5-node run can be read back afterwards."
---

Raft-Implementation is a course project for CSE530 Distributed Systems at IIIT Delhi in 2024, with Aditya Ahuja and Deeptanshu Barman. The repository is Aditya's. It is a Raft cluster in Python: five nodes talk over gRPC using the two Raft RPCs, RequestVote and AppendEntries, plus a serveClient RPC that takes GET and SET commands from a small command line client and forwards them to the leader. Each node keeps its log, a metadata file (term, commit length, vote) and a dump file on disk, so a restarted node picks up where it left off. The election timeout is drawn from 5 to 11 seconds and the leader sends a heartbeat once a second. The cluster was deployed on five Google Cloud VMs.

My part was the leader lease, the idea from YugabyteDB that lets a leader answer reads without a round trip to the followers. The leader renews its lease each time its heartbeats reach a majority of the cluster and steps down to follower when the lease timer fires. My commit set the lease to 3 seconds and Deeptanshu raised it to 8 the same day. Followers learn the lease duration from AppendEntries and do not start an election while the lease is live. The RequestVote response carries a lease duration so that a winning candidate can wait out the old leader's lease before it serves. GET and SET are refused with a message while the leader has no lease. For this I added the lease field on the RequestVote response to the proto, the lease state and its start, renew and timeout handlers in the node, and the lease checks in the client path. The AppendEntries lease field and the timer class were already there from Deeptanshu.

I also added the first version of the per-node dump and metadata files, writing a line for each election timeout, vote granted or denied, lease expiry and step-down, accepted or rejected AppendEntries and failed RPC. Deeptanshu then moved the metadata into its own class. My share is small: 3 of 45 commits, on 30 and 31 March 2024. Aditya and Deeptanshu wrote the election, replication and client code around it.
