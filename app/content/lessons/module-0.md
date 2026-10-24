---
title: First designs
minutes: 20
---

## Requests and blocks {#m0-requests-and-blocks}

When you open a web page, something has to find the page, put it together and send it back to you. A design is a map of the parts that do that work. In this app, each part is a block, and a line between two blocks means one asks the other for something.

Take the website of a village hall. It lists upcoming events. Three blocks are enough. The visitor's browser sends a request, which is a message asking for something. A server, which is a computer running your application code, receives it. The server asks a database, which is a store of organised records, for the list of events. The database answers the server, and the server builds the page and sends it back.

Each block does one job. The server decides what to ask for and how to present it. The database keeps the records safe and finds them. The browser never talks to the database directly, because the server is where your rules live.

Every block also has a limit: how much work it can do in a second. The next page is about what happens at that limit.

::: quiz
A visitor opens the village hall's events page. Which order does the request follow?
- [x] The browser asks the server, the server asks the database, the database answers the server, and the server answers the browser.
- [ ] The browser asks the database directly, and the database answers the browser.
- [ ] The server asks the database first, and only then does the browser send its request.
> The server sits in the middle: it receives the request, asks the database for what it needs, and builds the reply.
:::

## Capacity and overload {#m0-capacity-and-overload}

A bakery takes orders on its website. On a normal day, 40 requests arrive each second, and one server copes easily. The number of requests that arrive each second is the [[requests per second|request rate]], often shortened to [[rps]].

Every block has a [[capacity]]: the most requests per second it can handle. Say the bakery's server can handle 100. On the Saturday before a bank holiday, the rate triples and 120 requests a second arrive. That is more than 100.

What happens to the extra 20? In this app's model, they are not served. Visitors see errors or very long waits. Worse, as a block gets close to its limit, every request it does answer takes longer, so even the lucky ones notice.

Capacity costs money. A bigger server, or more of them, raises the monthly bill. Most problems in this app come with a budget, which is the most you are allowed to spend each month. A design that never overloads but costs twice the budget has not solved the problem either.

So the question is never just "can it cope?". It is "can it cope for this traffic, at this price?"

The bakery's numbers are invented for the lesson. The app uses simple rules for how latency rises and what a block costs. They are good enough to show the pattern. They are not a capacity calculator for real systems.

## Copies and the balancer {#m0-copies-and-balancer}

The bakery's server is full. There are two ways to cope. You can buy a bigger server, or you can run several identical copies of the same server. Copies have an advantage that size does not: if one stops working, the others carry on.

Copies need something to share the requests out between them. That is a [[load balancer]]. It receives each request and passes it to one of the copies. In this app, each copy is called a [[replica]], or an [[instance]] of the block.

Suppose the bakery runs three copies of its server, each able to handle 100 requests a second. Together they can handle 300, which is enough for 120. Now one copy fails. Two remain, and they can handle 200. The bakery is still serving everyone, with less room to spare. With only one copy, the same failure would have taken the site down.

Copies are not free. Each one adds to the bill, and so does the balancer. And the balancer is a block too, with a limit of its own. If it is a single copy, it becomes the part that can take everything down.

You will see warnings in the app about blocks that exist as a single copy. The warnings are pointing at this risk. The database is one copy in the village hall example as well. Later lessons show how to make copies of data, which is harder than copying a server, because the copies must agree with each other.

Copies of a server work well here because each copy is the same and keeps nothing that the others need. This model assumes that. Real systems have more to think about, such as sessions and shared state.

## Files and records {#m0-files-vs-records}

A recipe website keeps two kinds of thing. There is information about each recipe: its title, its ingredients, how long it takes, how many people have saved it. And there are photographs of the finished dishes.

The first kind is a record. A record is small, has a clear structure and is often looked up or changed by itself. "Find every recipe that takes under thirty minutes" is a question about records. A database is built to answer questions like that.

The second kind is a file. A file is large, is not something you search inside and is fetched or stored as a whole. A photograph of a dish might be several megabytes. Nobody asks the database to find "the recipes whose photo has a blue plate".

You could put the photographs in the database. It would work for a while. But every photograph makes the database bigger, its backups slower and its busiest moments busier, and the database is the block you most want to keep fast. Files have a better home.

This rule of thumb is not exact. "Large" is relative, and some systems do store small files in a database on purpose. But when you are unsure, ask two questions: do I need to search inside it, and do I fetch it whole?

::: quiz
Which of these belongs in blob storage, rather than in the database, on a recipe website?
- [ ] A recipe's title and ingredient list.
- [x] A 4 MB photograph of the finished dish.
- [ ] The number of people who have saved a recipe.
- [ ] The date a recipe was published.
> The title, the count and the date are small records that are looked up and changed by themselves. The photograph is a large file that is fetched whole, so it belongs in blob storage.
:::

## Blob storage and the CDN {#m0-blob-and-cdn}

A school publishes next term's timetable as a PDF. On the first morning, thousands of parents open it within minutes.

Where should that file live? In blob storage. This is a block designed to keep files durably, which means they stay safe and are still there tomorrow. It is cheap per file and can hold very large amounts.

But blob storage can still be overwhelmed by thousands of people fetching the same file at once, and a parent far away waits longer than one nearby. A [[CDN]] helps with both. A CDN keeps copies of popular files in many places close to readers. The place where the original lives is the origin. When a parent asks for the timetable, the nearest copy answers. Only when there is no nearby copy does the request go back to the origin.

How often the nearby copy has the file is the [[hit ratio]]. If 90% of requests are answered at the edge, only 1 in 10 reaches the origin. The origin's load falls to a tenth, and parents get their answers sooner.

There are two limits to remember. First, the hit ratio is a number you choose when you design. A real workload decides its own, and a file that is rarely requested will not stay at the edge. Second, writes are different: when someone uploads a new timetable, it must reach the origin. The edge can only answer reads.

A CDN is not the place where files are kept. The edge copies come and go. If the original is not safely stored at the origin, there is nothing for the edge to copy from. Think of the CDN as a fast shelf in front of the warehouse, not the warehouse itself.

In this app, the CDN keeps the origin's load down, and the model never loses a file. A real system has to plan for both.

Optional, and not scored: pick a website you use often. If ten times as many people arrived tomorrow, which of its blocks would you worry about first?

::: summary
- A request passes through blocks, and each block does one job and has a limit.
- When work arrives faster than a block's capacity, some of it is not served.
- Several copies behind a load balancer share the work and survive one failing, but they cost money.
- Records and files need different homes: search and change records in a database, keep large files in blob storage.
- A CDN takes read load off the origin, but it is not where files are kept.
:::
