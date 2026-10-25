---
title: Search, maps and media
minutes: 28
---

## Finding words quickly {#m4-inverted-indexes}

A box holds ten thousand recipe cards. You want every card that mentions both "lemon" and "thyme". Scanning every card for every search does not scale.

Prepare a second structure ahead of time: for each word, the list of card ids that contain it. The "lemon" list and the "thyme" list are short compared with ten thousand cards. Intersect the two lists; ignore everything else. That structure is an inverted index: documents normally point to their terms; here each term points to its documents. Module 3 introduced a search index as a separate block; this is the core data structure inside it.

The price is space and write amplification. Every distinct term needs a posting list. Adding a card with a hundred words means about a hundred list updates (plus any ranking metadata). Indexing a document is far more work than appending a row to a heap file; searching becomes far cheaper than a scan.

Inverted indexes suit corpora that are searched far more often than they change: recipes, articles, product catalogues. High-churn data pays continuous reindex cost for every mutation.

A search index in the app has capacity, shard count, and cost. Tokenization, ranking, and fuzzy spelling stay off-screen. Real search engines do all of that. What you practice here is whether the design includes a search tier and how large it is relative to query load.

::: demo d4-word-index
:::

## Finding places quickly {#m4-geographic-indexes}

You want the nearest bike stand. Checking every stand in the country and computing distance each time is another scan: correct, and far too slow at city scale.

A geographic index groups points by region of space so "near me" examines a local neighbourhood of cells or bounding boxes instead of scanning the whole planet. The app offers a few structures with different update and query trade-offs.

A geohash grid partitions the map into fixed squares. Inserts are cheap: hash the coordinates, append to that cell. Dense city centres pack huge posting lists into one cell, so that cell becomes a hot spot for both storage and query. A quadtree subdivides a cell into four when it exceeds a fullness threshold, so dense areas get finer cells automatically. An R-tree keeps hierarchical, possibly overlapping bounding boxes; range and nearest queries are strong, but inserts and moves cost more tree maintenance.

In the model, the grid is cheapest to update and weakest under crowding; the R-tree is strongest on queries and dearest to update; the quadtree sits between. Workloads where points rarely move (stands, shops) should bias toward query quality. Fleets of moving vehicles stress update paths harder.

Extra replicas of a geo index raise query capacity. Update capacity stays the same, because every replica must apply every write. Raising update capacity means sharding the map by area (partition key = region), with the same hot-spot risk Module 3 described for popular keys: a packed city centre can still melt one shard.

Capacity multipliers and crowding show up in the model. Maps and real geodesic distances do not.

::: demo d4-geo-structure
:::

## Moving large files {#m4-large-file-delivery}

A friend uploads a two-hour wedding video. The connection drops at 90%. If the upload was one monolithic PUT, the whole transfer restarts and the first 90% is wasted. On flaky mobile networks that may never complete.

Chunk the object: send the file as many independently checksummed parts. After a drop, the client asks which parts the server already has and resends only the missing ones. That pattern is a resumable (multipart) upload.

Chunk size is a trade-off. Tiny chunks minimise retransmission waste but multiply request overhead and bookkeeping. Huge chunks mean fewer parts but more bytes to redo on failure. A middle size is the usual production choice.

Chunks help downloads too. A viewer who wants only the last ten minutes can request those byte ranges or segment files. Popular segments are natural CDN cache keys: the origin emits each segment once; edges serve repeated hits, as in Module 0.

Blob storage and CDN capacity and cost are in the model. Mid-transfer failure and last-mile bandwidth are left for you to discuss in a write-up. This page is so you can state the resumable-chunk rationale clearly when you do.

::: demo d4-chunks
:::

## Streaming and adaptive video {#m4-streaming-and-adaptive-video}

You watch a film on your phone, leave Wi-Fi, and land on a weak mobile signal. Freezing the picture until bandwidth returns is the worst UX for most viewers. Dropping to a lower resolution and continuing is better.

Adaptive bitrate streaming encodes the title into short segments (a few seconds each) at several quality ladders, from small/rough to large/sharp. The player downloads a segment, measures arrival rate, and picks the next segment's quality. When the link worsens it steps down; when it recovers it steps up.

Players also keep a buffer of upcoming segments. The buffer absorbs short jitter; if it empties, playback stalls.

For the service, the consequences are operational. Preparing every quality is heavy CPU work: one upload becomes many encodes (transcoding). That work is slow, so it runs asynchronously on workers (Module 2), and a burst of uploads can build a transcoding backlog. A premiere is a different spike: many viewers fetch the same early segments at once, which is exactly CDN territory.

Transcoding capacity and the playback path should stay apart. A jammed encode farm must not starve the servers or origins that feed active viewers.

CDN, blob storage, background conversion, and upload bursts are in the model. Segments, ladders, players, and buffers are vocabulary for what you write. Judgement on those designs lives mostly in the write-up.

::: quiz
A film is available in several qualities, each cut into short segments. A viewer's connection becomes weak halfway through. What should happen?
- [ ] The player waits until the connection is strong again, then carries on from the same place.
- [x] The player asks for the next segments in a lower quality, so the picture is less sharp but keeps playing.
- [ ] The service sends the whole film again in the lowest quality.
- [ ] The service converts the film again while the viewer waits.
> Adaptive video prepares every segment in several qualities in advance. The player chooses the quality it can keep up with, and changes as the connection changes.
:::

## Crawling politely {#m4-crawling-and-host-limits}

A librarian must copy a thousand pages from a few libraries, most of them from the largest one. Slamming that library with every request first, as fast as possible, overwhelms its staff and may get the librarian banned. A polite approach spreads load across hosts and spaces requests to any one host.

A web crawler is in the same position. It fetches pages, extracts links, and fetches those. Design work clusters around a few recurring concerns.

Deduplication: the web is full of cycles and cross-links. Without a memory of seen URLs the crawler loops and wastes fetch budget. That memory is a cache-like set. In this app its hit ratio is capped at 0.45, so some addresses are forgotten and refetched. Checking is cheap; perfect recall is not assumed.

Frontier: addresses still to fetch live in a queue (Module 2). A long frontier is backlog; workers drain it at some rate, with all the backlog maths you already know.

Politeness: each origin can only absorb so many concurrent requests. A per-host rate limit (for example one request per second per domain) prevents one site from taking the entire crawl budget. A single global limiter leaves a hole: 1,000 rps global can still be 1,000 rps at one host.

The app provides one global rate limiter and checks that your design includes a limiter, a frontier queue, and a seen-URL cache. It cannot verify per-host limiting; that part is judged in your written explanation. Say that you would key limits by host (or IP) and why a global cap alone fails.

Failed fetches need backoff: do not hammer a down host while other hosts have work; schedule a later retry.

::: demo d4-polite-crawl
:::

Optional, and not scored: think of an app that finds things near you or finds words in a lot of text. What do you think it keeps ready in advance to answer quickly?

::: summary
- An inverted index keeps a list of items for each word, so a search reads a few lists instead of every item. Adding an item means updating many lists.
- A geographic index groups places by area. A grid updates cheaply but crowds in dense areas, a tree answers queries well but costs more to update, and a quadtree sits between. Extra copies add query capacity; update capacity stays the same until you shard.
- A large file is sent in pieces, so a failed transfer resumes from the missing pieces. The size of a piece is a trade-off.
- Adaptive video is prepared in several qualities and cut into short segments. The player picks the quality it can keep up with, and the preparation is heavy background work.
- A crawler skips pages it has seen, keeps a list of addresses to fetch, and limits its speed per site. One limit across all sites fails the politeness test.
:::
