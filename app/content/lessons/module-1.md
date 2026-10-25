---
title: Traffic, copies and correctness
minutes: 22
---

## Reads and writes {#m1-reads-and-writes}

Every request either reads or writes. A read asks for data that already exists (show a recipe). A write changes stored state (create a booking, post a comment, edit a profile). The two stress storage differently, and the mix between them decides which limit you hit first.

A recipe site is read-heavy: maybe 970 of every 1,000 requests only view a recipe, and 30 save one. A ferry booking page can be close to half writes: 500 of every 1,000 requests reserve a place.

Stores usually publish separate capacities for each. Writes are typically slower because they must be logged and flushed, and often locked so concurrent updates do not collide. Invented numbers for the lesson: a database answers 2,000 reads/s but only 400 writes/s. The recipe mix (970 reads, 30 writes) sits comfortably inside both limits. The ferry mix (500 reads, 500 writes) is fine on reads and over capacity on writes, even though total rps is the same 1,000. Aggregate request rate hides the bottleneck when the write share is high.

That is why caches and CDNs help some products a lot and others almost not at all. A cache can satisfy a read without touching the store. A write still has to reach the store (and usually invalidate or update cached copies). In this app, a cache or CDN in front of a store removes read load; every write still goes through.

When you read a design, estimate write share early. It tells you whether to invest in read scaling (replicas, caches) or in write scaling (shards, queues, stronger hardware).

::: demo d1-mix
:::


## Cache hits and misses {#m1-cache-hits-and-misses}

A cinema shows the same film all weekend. Thousands of people look up showtimes. Asking the database for the identical answer thousands of times wastes capacity that could serve less popular queries.

A [[cache]] is a fast store of recent answers, usually in memory. On the first request for those showtimes the cache is empty: a miss. The cache fetches from the database, stores the answer, and returns it. The next thousand identical requests are hits: answered from the cache without database work.

The [[hit ratio]] is the fraction of requests served from the cache. At 90%, one request in ten still misses and reaches the database. The number that matters for capacity planning is miss rate times total traffic: that is the load the store must still carry. A "high" hit ratio at huge traffic can still flood the origin.

Hit ratio comes from the workload. You do not configure it once and keep it forever. If every visitor asks for a unique key, reuse is near zero and the cache helps little. Caches accelerate reads; writes still hit the store and must refresh or invalidate entries. A cache is also a block with cost and failure modes: if it dies, miss rate jumps to 100% and the database sees a thundering herd it may not have been sized for.

This app treats hit ratio as a single design number. Production caches also choose eviction policy, TTL, and how to handle updates to the source of truth. Those details matter in real systems; the simulator leaves them out so you can focus on the load-shifting idea.

::: demo d1-cache
:::


## Replicas and the difference between a copy and a slice {#m1-replicas-vs-shards}

A hobbyist forum has many readers and few posters. The database is the hot block. Two common responses get confused: copying the data, and cutting the data.

A [[replica]] holds the same data as the primary (or as its peers, depending on topology). Reads can be spread across replicas, raising read capacity. If one replica fails, others still hold a full copy, which helps availability.

A [[shard]] holds only a slice of the data (for example posts for one range of member ids). Each shard has its own write path, so write load spreads as well as read load. Sharding is partitioning; replication is duplication.

Replica sets help reads and survival. In the usual primary-replica setup they leave write capacity unchanged: every write still lands on the primary (or a consensus group), then is shipped to followers. For a read-heavy forum that is fine. For a write-heavy system you need something else. Replication also takes time, so a follower can lag: a user might post a reply and miss it on refresh if their read hits a lagging replica. The app skips replication lag; real systems must choose read-your-writes strategies when lag matters.

Shards have a different tax. To fetch a row you must know which shard owns it (or broadcast). A query without the shard key becomes a scatter-gather across all shards: slower and more expensive. Choosing the partition key is a first-class design decision; a later lesson returns to skew and hot keys.

The glossary short form: a [[replica set vs shard|replica set and a shard]] are different tools, and large systems often use both (each shard replicated).

App warnings about a database with no replica are about this page: one copy is one failure domain for the data.

::: demo d1-replicas
:::


## Two writers and locks {#m1-two-writers-and-locks}

Two housemates share a joint account with 100 in it. At the same moment each tries to withdraw 50. The correct final balance is 0.

Without coordination, both requests can read 100, both compute 100 − 50 = 50, and both write 50. The account shows 50 after 100 was paid out: one withdrawal vanished. That failure mode is a lost update. It appears whenever two writers read the same value, compute a new value independently, and write back without noticing each other.

A [[lock]] serialises writers on the contested item. While one writer holds the lock on that balance (or row), the other waits. The second then reads 50, subtracts 50, and writes 0. Correctness is restored.

The cost is queueing. Under contention, writers wait on each other and effective write throughput for that hot row falls. In this app the database Locking setting models that trade-off: no locking allows lost updates; row locks hold one writer per row; stricter modes do more isolation work and cost more capacity. Safer usually means slower under conflict.

A lock protects against lost updates on the locked unit. System-wide write capacity stays the same, and hot keys get worse if everyone contends on the same row. Whether a locked design still meets its write rate is something you measure (or check in the demo). Adding locks is no substitute for that check.

::: demo d1-race
:::


## Unique IDs {#m1-unique-ids}

Two stalls at a village fair hand out raffle tickets. Every ticket needs a unique number. Both stalls must avoid issuing 417.

Each strategy shifts cost somewhere else.

Random IDs from a huge space (UUIDs and similar) make collisions rare. You may still check uniqueness on insert, and that check is a write-path cost. Coordination between stalls is minimal.

Range allocation gives each stall its own block of numbers (1-500 and 501-1000). Each stall increments locally with no per-ticket chatter. Throughput is high, but someone must hand out ranges safely, unused numbers in a slow stall are stranded until reclaim, and ranges themselves need a coordinated allocator.

A central counter issues the next number on every request. Ordering is natural and uniqueness is easy. Every ticket waits on that counter, so the counter becomes a throughput and availability bottleneck: if it stops, issuance stops.

Whatever you pick, you still need a trustworthy way to settle conflicts when two processes claim the same number or the same range. In this app that means a database with locking: ranges allocated one at a time, or uniqueness checks that cannot race. Without locking, two servers can still mint the same ID.

The app exposes an ID strategy setting on a server for this choice.

::: quiz
Two stalls at the fair ask a single counter for every new ticket number. What is the main risk of that approach?
- [ ] Two tickets can easily end up with the same number.
- [x] Every ticket has to wait its turn at the counter, and if the counter stops, no ticket can be issued.
- [ ] Each stall wastes most of the numbers in its own range.
- [ ] Numbers can no longer be placed in order.
> A single counter never repeats a number, and it keeps them in order. The cost is that everything queues at one place, so it can slow things down, and it is one place that can fail.
:::

## Regions and distance {#m1-regions-and-distance}

A school-notices app serves parents across Europe, Asia and the United States from a server in Virginia. A parent in Sydney opens it. Part of the wait is compute: building the page, querying the database. The rest is propagation delay. Light in fibre is fast, yet a round trip across an ocean is often tens to low hundreds of milliseconds before any application work starts. If one user action triggers several sequential cross-region calls, those delays add.

A [[region]] is a geographic placement where blocks run (a cloud region, roughly). Putting every block in one region is fast for nearby users and slow for distant ones. It also couples fate: a regional outage takes the whole product down. The app warns when everything lives in one region.

Moving an app server nearer to Sydney helps only if the data is near too. A Sydney server talking to a Virginia database still pays the ocean on every query. A read replica (or other local copy) in the region answers local reads. Writes still go to the primary in the home region, so a Sydney parent posting a comment pays the round trip home. Multi-region designs often make reads fast everywhere and leave writes slower far from the primary, unless you adopt multi-primary writes (which bring conflict problems of their own).

This app places blocks in a small set of regions with fixed pairwise distances. Those numbers are simplifications; real latency varies by path and time of day. Distance adds delay. Local copies help reads. Writes still prefer a home for the source of truth.

::: demo d1-regions
:::

Optional, and not scored: think of two people changing the same thing at once in an app you use. What do you think it does to stop one change being lost?

::: summary
- Reads and writes behave differently, and the mix decides which side of a store is the limit.
- A cache's hit ratio is a number you hope for, and the share that misses is what the store carries.
- A replica is a copy of everything and helps reads and survival. A shard is a slice of the data and spreads writes. Replicas do not add write capacity.
- A lock stops two writers losing each other's update, at the price of making the second one wait.
- Anything that needs a number nobody else has needs an agreed way to make it, and each way has a cost.
- Distance adds delay. A copy of the data near the reader helps reads, and writes still go to the home region.
:::
