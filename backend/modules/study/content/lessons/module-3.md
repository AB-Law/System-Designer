---
title: Data and query shape
minutes: 32
---

## Tables and engines {#m3-data-models}

A town shop keeps orders as paper slips in a box: name, date, items. A customer rings and asks what they ordered last month. With fifty slips the owner can leaf through. With fifty thousand, that linear scan fails as a product.

A database stores data in tables: sets of rows that share the same columns, like slips printed from one template. The shop might have a customers table and an orders table, with each order row pointing at a customer id. The data model is which tables you create, which columns they have, and how they reference each other (the schema and relationships).

The model decides which questions are cheap. "Fetch order 4821 by primary key" is cheap when orders are indexed by id. "Everything this customer ordered last month" needs a path from customer to orders by time; without the right keys or indexes you fall back to reading far more rows than you need.

Not every workload fits one engine. The app offers a few engine labels that change modelled behaviour. A relational engine keeps related tables and answers varied joins and filters (orders with customers). A key-value engine fetches one value by key very quickly and offers little else. A time-series engine is built for points that arrive in time order (a reading every second) and for range queries over intervals.

Pick from the questions you must answer under load. Fashion is a poor guide. The engines here are behavioural labels in the simulator. They are simplified stand-ins for Postgres, Redis, or Influx.

::: quiz
A weather station records the temperature every second, and the owner mostly asks, "What was the temperature between 2 pm and 3 pm yesterday?" Which kind of engine fits that shape of data best?
- [ ] A key-value engine, because every reading has a key.
- [ ] A relational engine, because it can answer every possible question.
- [x] A time-series engine, because the readings arrive in time order and the question is about a stretch of time.
- [ ] None of them, because readings are too small to store.
> Choose an engine by the shape of the data and the questions you ask. A stream of readings asked about by time range is what a time-series engine is built for.
:::

## Query plans {#m3-query-plans}

The shop now has a million orders. A customer wants their three latest. With no help, the engine has to invent a plan from scratch.

A query is a question. Before answering, the engine picks a plan: an ordered set of steps. The blunt plan is a sequential scan: read every row, keep matches. A million rows read to return three is the textbook waste.

Work is more than filtering. Ordering those three by date is a sort; sorting a huge intermediate set is far costlier than sorting three rows already narrowed by an index. Offset paging ("skip 50,000 rows, then take 10") forces the engine to walk or materialise everything before the offset; cost grows with page depth. Keyset (seek) paging ("ten rows after this last seen key") avoids that walk and stays stable as the list grows.

A join combines tables (order plus customer name). Each join adds matching work across sides; nested or poorly keyed joins multiply touched rows quickly.

The app puts rough relative costs on scan, index fetch, sort, deep offset, and joins. When the summed cost exceeds what the database can sustain, requests slow and fail under load. You are not meant to memorise the tariff. For every screen, note which query it fires and roughly how many rows that query must touch.

Real optimisers keep statistics and choose among many plan shapes. The app's costs are a teaching simplification of that idea.

::: demo d3-query-plan
:::

## Indexes and what they cost {#m3-indexes-and-cost}

A book index maps words to page numbers so you do not read the whole book. A database index is an extra structure (often a B-tree or similar) that maps key values to row locations so the engine can jump to matches instead of scanning.

With an index on customer id, "this customer's orders" touches only that customer's rows. A million-row scan becomes dozens of row fetches. If the index also leads with date (or includes it in a way that supports order), the three latest can come out already sorted and skip an explicit sort. Indexes are built for specific access paths; column order in a composite index matters.

Indexes have a price. On every insert or update of an indexed column, each index on that table must be maintained. More indexes mean dearer writes and more storage. On a read-heavy table a few well-chosen indexes are usually a bargain. On a write-heavy table each unused index is a permanent tax: you pay on every write and never collect on reads.

The app caps indexes per table (six) to force prioritisation. Production limits differ, but the habit is the same: every index should answer a named query you care about.

::: demo d3-query-plan
:::

## A first look at search {#m3-search-index-first-look}

The shop adds a free-text note on each order. A customer asks for "the order where I wrote that it was a gift." An index on customer id does not help: the predicate is words inside a string.

Full-text search is a different access pattern from primary-key or equality lookup. A relational engine can `LIKE '%gift%'`, but that usually means scanning notes, which is exactly the load you wanted to avoid on the orders database. If every search hits the primary store, interactive order traffic shares fate with exploratory text queries. The app warns about that pattern.

The usual answer is a search index: a separate system (or specialised index) built for token lookup. It is populated from the primary data and answers word queries so the OLTP database does not.

The pattern cost is consistency lag. The search index is a derived copy in another shape. After a write, it can trail the primary for a short time; a search that misses a just-added note is normal under eventual consistency. You also pay for the indexing pipeline and for another block's capacity and bill.

In the app, search is a block with capacity and cost. How tokens are matched and ranked is left for a later lesson; here the point is when to introduce the block at all.

::: demo d3-search
:::

## Transactions {#m3-transactions}

You move 50 pounds from savings to current: debit one account, credit the other. Power fails after the debit. Without care, 50 pounds has left savings and never arrived in current.

Those two updates are one business operation. They must both commit or both roll back. A [[transaction]] groups changes so the database treats them as atomic: all succeed together, or none remain. That atomicity (with durability of the commit) is why databases are trusted for money-like invariants.

Transactions also define what concurrent readers and writers may see. Mid-transfer, a reader might observe a balance that looks like money vanished. Stronger isolation, especially Serializable in this app, makes concurrent transactions behave as if they ran one after another. The engine does more locking or version bookkeeping to get there, and write throughput falls. The app charges that cost on writes when Serializable is on.

For every multi-step change, decide whether the steps must succeed or fail together. If they must, wrap them in a transaction and budget for the isolation level you need. A single-row update often needs no multi-statement transaction beyond the engine's default single-statement atomicity.

This page assumes one database. Changes that span two services or an external provider need different patterns (sagas, outbox, reconciliation); the money module returns to that.

::: demo d3-transaction
:::

## Choosing a partition key {#m3-partition-keys-and-skew}

When one database cannot hold the data or absorb the writes, you cut it into [[shard|shards]] (slices). Module 1 contrasted shards with replicas: a replica copies everything; a shard holds a part.

Partitioning needs a rule for which shard owns a row. The attribute used in that rule is the [[partition key]]. A delivery company logs every parcel scan: ten shards, a million scans a day. The key choice decides whether those shards earn their keep.

Keying by first letter of surname clumps common letters onto a few shards. Keying by calendar date sends all of today's scans to today's shard while the other nine sit idle. You paid for ten shards and got the write capacity of roughly one. The overloaded shard is a hot spot; the uneven distribution is skew.

A good key spreads rows evenly and appears in the queries you care about. If "all scans for parcel X" is common and parcel id is the key, each query hits one shard. If you ask "all scans at this depot today" without the key, the engine must scatter to every shard and gather results: slow, and it couples shard load. The app calls that a scatter.

There is rarely a perfect key. The one that spreads load may not match your hottest query. You pick for the paths that matter under load and accept that others pay scatter cost.

A single extremely popular key value is a [[hot key]] problem sharding cannot fix by adding shards: every write for that key still lands on one shard. Remedies look like sub-keys, queues, or special casing that entity.

Uneven shards, scatter, and hot keys show up in the shard model. Cache hot keys are left out of that picture.

::: demo d3-shard-key
:::

## Fan-out: write time or read time {#m3-feed-fanout}

A club has a noticeboard and forty members. When the secretary posts, someone has to put that notice in front of each member.

Fan-out on write: on post, copy the notice into each member's pigeonhole (inbox). Reads are cheap (look in your box). Writes cost O(members). Spreading one item to many destinations is [[fan-out]]; doing it at write time front-loads that cost.

Fan-out on read: keep one notice on the board. On read, each member scans and filters what applies. Writes are O(1). Reads do more work every time.

For forty members, write-time copy is cheap and reads feel instant. For four million followers, one post means four million inbox writes: latency, storage, and waste for inactive members. Read-time assembly (or a hybrid) becomes necessary. Many products mix: precompute inboxes for typical accounts, and assemble on read for celebrities.

The trade shows up wherever one write must become many views. Write-time fan-out buys cheap reads; read-time fan-out buys cheap writes. Celebrity / viral keys break naive write-time fan-out.

The app can spike one capability as if a very popular account posted, to test whether your design survives the popular case as well as the median.

::: demo d3-fanout
:::

## Order, streams and replay {#m3-ordering-streams-replay}

A relay team logs each baton hand-off. If the log shows runner 2 passing before runner 1 handed over, the record is wrong. Order is part of the meaning.

Module 2 treated a queue as jobs handed to workers; once processed and acked, the job is gone. That fits "do this once."

A [[stream]] is an ordered, retained log of events. Multiple consumers can read the same log at their own offsets. A lagging consumer catches up. A consumer can rewind within retention and replay history. Replay is the main capability queues leave out: queues discard after successful processing; streams keep events for a configured time.

Order is guaranteed per key (or per partition). Events for one runner keyed by runner id stay in order. Events for different runners may interleave; that is fine if cross-runner order does not matter. The key also drives partitioning of the stream: a hot key piles traffic onto one partition while others idle, same pathology as shard hot keys. The app treats a hot stream key as leaving only one or two partitions doing useful work.

Retention bounds replay: you cannot rewind past what the stream still holds. In the app, replay requires retaining events for at least a day.

A queue is work to perform. A stream is a history you can re-read.

|                  | Queue                    | Stream                                  |
| ---------------- | ------------------------ | --------------------------------------- |
| What it holds    | Jobs to be done          | Events that happened                    |
| After it is read | The job is gone          | The event stays until retention ends    |
| Readers          | Workers sharing the jobs | Many readers, each with their own place |
| Order            | Not promised             | Kept for events with the same key       |
| Read again       | No                       | Yes, within retention                   |

::: demo d3-stream-order
:::

## Live connections {#m3-live-connections}

A scoreboard must update the moment a goal is scored. Polling every second ("anything new?") mostly returns no, yet still costs request handling at the scale of viewers × frequency.

A live connection (commonly WebSocket, modelled as its own block here) stays open. When an event happens, the server pushes on the open socket and the page updates without a fresh HTTP round trip.

The cost is residency. A normal request is request/response then gone. An open connection holds memory and file descriptors, and often per-connection buffers, for as long as the tab stays open. A million concurrent viewers means a million live sessions; capacity is measured in open connections as much as in messages per second. That is why the app sizes this block differently from a stateless HTTP server.

Use push when freshness of seconds-or-less matters at scale. If multi-second delay is fine, short polling or periodic refresh is simpler and cheaper to operate.

Reconnect storms, half-open sockets, and lost frames on the wire sit outside the model.

::: quiz
A page shows a live match score that must update the moment a goal is scored, for thousands of viewers at once. Which description is right?
- [ ] Polling every second is cheaper, because the server never has to keep anything.
- [x] A live connection pushes updates instantly, but the server must hold one open connection per viewer.
- [ ] A live connection needs no memory, because nothing is stored.
- [ ] Polling and a live connection cost the same, because the same updates are sent.
> A live connection avoids the pointless "anything new?" questions and delivers updates the moment they happen. The cost is that every open connection uses memory on the server.
:::

## Stale reads and consistency {#m3-stale-reads-and-consistency}

You post a comment, refresh, and the comment is missing. The site may still be working. The page may have been served from a replica or search index that has not yet applied the write. Derived copies trail the primary by some replication lag. A read that sees an older version is a stale read.

For each read path you choose a freshness policy. Always reading the primary gives up-to-date data but concentrates load and may be far from the user. Reading a nearby replica spreads load and cuts latency, at the cost of possible staleness. Consistency here means how fresh a read is guaranteed to be; stronger guarantees usually cost latency or primary load.

Different questions deserve different policies. A product page showing "3 in stock" from a replica being a few seconds behind rarely matters for browsing. The till selling the last unit needs the primary (or a carefully designed reservation). One system, two freshness requirements.

Judge the harm if this read is a few seconds old. Small harm means a replica or cache is fine. Real harm (double sell, double pay) means read the source of truth and pay for it.

Replica lag is not simulated; copies are treated as current. Use this page when you reason about staleness in written designs even though the simulator hides it.

::: demo d3-stale
:::

Optional, and not scored: pick a screen in an app you use that shows a list of things. What question do you think the app answers to build it, and what would make that slow?

::: summary

- A query is a question, and the shape of the data decides what it costs. Choose a data model and an engine for the questions you need to answer.
- A scan reads every row. An index jumps to the right rows, but every index makes every write dearer.
- A search index answers questions about words, as a second copy of the data that can be a moment behind.
- A transaction makes changes happen together or not at all, and a stronger setting costs write speed.
- Cutting data into slices needs a good partition key. A bad key leaves one slice doing all the work, and a question without the key asks every slice.
- Fan-out on write makes reads cheap and writes dear. Fan-out on read does the opposite. Very popular items break the first.
- A stream keeps events in order for each key and can be read again. A queue hands each job out once.
- A live connection pushes at once and uses memory for every open connection.
- A copy can be a moment behind, so decide for each read how stale it may be.
  :::
