---
title: First designs
minutes: 20
---

## Requests and blocks {#m0-requests-and-blocks}

When you open a web page, something has to find the page, put it together and send it back to you. A design is a map of the parts that do that work. In this app, each part is a block, and a line between two blocks means one asks the other for something.

Take a village hall website that lists upcoming events. The visitor's browser sends a request: a message that names what it wants (the events page, say) and how it wants the answer. A [[server]] receives that message. A server is a process running your application code. It checks what the visitor may see, picks which records to fetch, and builds HTML or JSON from them. The server then asks a database for the event list. A database is a store of organised records with a query language for finding and changing them. The database answers the server; the server builds the page and replies to the browser.

Each block does one job. The server decides what to ask for and how to present it. The database keeps the records safe and finds them. The browser never talks to the database directly. The server is where your logic lives.

Blocks also have a hard limit on how much work they can finish per second. The next page is about what happens when traffic crosses that limit.

::: quiz
A visitor opens the village hall's events page. Which order does the request follow?
- [x] The browser asks the server, the server asks the database, the database answers the server, and the server answers the browser.
- [ ] The browser asks the database directly, and the database answers the browser.
- [ ] The server asks the database first, and only then does the browser send its request.
> The server sits in the middle: it receives the request, asks the database for what it needs, and builds the reply.
:::

## Capacity and overload {#m0-capacity-and-overload}

A bakery sells online. On a normal day about 40 requests arrive each second, and one server handles them without strain. That arrival figure is the [[requests per second|request rate]], often shortened to [[rps]].

Every block also has a [[capacity]]: the most requests per second it can finish while staying within its normal latency. Suppose the bakery's server capacity is 100 rps. On the Saturday before a bank holiday the rate triples to 120. Twenty requests per second have nowhere to go.

In this app's model those extras go unanswered: visitors see errors or waits that look like failures. Watch what happens as you climb toward capacity. Queues form inside the block, each request waits longer for a free worker or disk, and latency rises for everyone, including the requests that still succeed.

Capacity costs money. A larger machine, or more machines, raises the monthly bill. Most problems here come with a budget: a hard monthly spend you may not exceed. A design that never overloads is fine only if the monthly cost is acceptable. You always weigh both: whether the design absorbs the stated traffic, and whether the bill stays inside the budget.

::: demo d0-one-server
:::

The bakery numbers are invented for the lesson. The app uses simple rules for how latency rises with load and what each block costs. Good enough to show the pattern; leave real capacity planning to production tools.

## Copies and the balancer {#m0-copies-and-balancer}

When one bakery server is saturated you have two levers. Scale up: buy a bigger machine. Scale out: run several identical copies of the same server process. Scale-out keeps answering if one copy dies, which scale-up cannot do. That redundancy raises throughput and keeps the site up when a copy fails.

Copies need a way to share incoming requests. A [[load balancer]] sits in front, accepts each request, and forwards it to one healthy copy. In this app each copy is a [[replica]], also called an [[instance]] of the block.

Each copy at 100 rps adds that much to aggregate capacity. A handful of copies clear 120 rps with room to spare. Lose one and the rest must still clear the load. A lone copy that fails takes the site offline: a single point of failure.

Nothing is free. Each replica adds to the bill, and so does the balancer. The balancer is itself a block with a capacity and a failure mode. If you run only one balancer instance, you have moved the single point of failure one hop earlier in the path.

The app warns when a block exists as a single copy. The village hall database is also a single copy in the first example. Later lessons cover copying data, which is harder than copying a stateless server: replicas of data must stay consistent with each other, and that consistency has its own costs.

This model assumes server replicas are interchangeable and keep no local state the others need. Real systems often have sessions, sticky routing, or in-memory caches that complicate that assumption. Treat the demo as the clean case.

::: demo d0-copies
:::

## Files and records {#m0-files-vs-records}

A recipe site stores two kinds of content. Metadata about each recipe (title, ingredients, cook time, save count) is small and structured, and you query it: "every recipe under thirty minutes", "recipes with thyme". That kind of content is a record. Databases are built for records: typed columns, indexes, updates to one field without rewriting a whole blob.

Photographs of finished dishes are different. A photo is large (often megabytes), fetched or stored as a whole, and rarely searched by its internal bytes. Nobody asks "recipes whose photo has a blue plate" as a database predicate. That kind of content is a file (in cloud terms, an object or blob).

You can shove photos into the database as binary columns. It works at small scale. Every photo then inflates backup size and lengthens restore time. The same disk and memory also have to serve query traffic. The database is usually the block you most want to keep fast and predictable. Files belong in storage built for bulk objects. That storage is cheap per gigabyte and durable, and you address each object by key instead of by SQL.

The boundary blurs at the edges. Tiny assets (icons, small JSON documents) sometimes live in the database on purpose to keep one transactional write. A useful check is whether you need to query inside the content, and whether you fetch it whole. Search-and-update points to records. Whole-object fetch points to blob storage.

::: quiz
Which of these belongs in blob storage, rather than in the database, on a recipe website?
- [ ] A recipe's title and ingredient list.
- [x] A 4 MB photograph of the finished dish.
- [ ] The number of people who have saved a recipe.
- [ ] The date a recipe was published.
> The title, the count and the date are small records that are looked up and changed by themselves. The photograph is a large file that is fetched whole, so it belongs in blob storage.
:::

## Blob storage and the CDN {#m0-blob-and-cdn}

A school publishes next term's timetable as a PDF. On the first morning thousands of parents open it within minutes.

The durable home for that file is blob storage: object storage designed to keep files safely across disk and machine failures, cheaply and at large scale. Durability here means the object is still there tomorrow even if one disk dies. Durability alone does not make every parent on earth get a fast download.

A single origin can still be overwhelmed when everyone fetches the same object at once. A parent far from the origin also waits on network distance even when the origin is healthy. A [[CDN]] (content delivery network) helps with both for read traffic. It keeps copies of popular objects at edge locations near readers. The place that holds the authoritative object is the origin. When a parent requests the timetable, the nearest edge that already has a copy answers. Only on a miss does the request go back to the origin (and the edge usually stores the result for next time).

The share of requests answered at the edge is the [[hit ratio]]. At 90%, only one request in ten reaches the origin: origin load falls by roughly an order of magnitude, and most parents see lower latency. Hit ratio is an outcome of the workload. It depends on how repeated the requests are and how long objects stay cached (TTL). Popular objects stay warm; a rarely fetched file will miss often.

Writes are a different path. Uploading a new timetable must update the origin; edges cannot invent an authoritative object. After a write you also need a plan for stale edges (short TTL, purge, or versioned URLs). In this app the CDN mainly reduces origin read load, and the model never loses a stored file. Production designs must plan for both origin durability and cache invalidation.

Think of a CDN as a fast shelf in front of the warehouse. The warehouse still holds the authoritative copies. Edge copies come and go. If the origin is wrong or empty, the edges have nothing trustworthy to copy.

::: demo d0-edge-origin
:::

Optional, and not scored: pick a website you use often. If ten times as many people arrived tomorrow, which of its blocks would you worry about first?

::: summary
- A request passes through blocks, and each block does one job and has a limit.
- When work arrives faster than a block's capacity, some of it is not served.
- Several copies behind a load balancer share the work and survive one failing, but they cost money.
- Records and files need different homes: search and change records in a database, keep large files in blob storage.
- A CDN takes read load off the origin. Durable files still live at the origin.
:::
