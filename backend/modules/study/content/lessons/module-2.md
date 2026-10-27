---
title: Work that happens later
minutes: 24
---

## Queues and workers {#m2-queues-and-workers}

A print shop takes photo-print orders. A customer hands over a memory card and asks for twenty prints. Printing takes minutes. The customer should not stand at the counter for that whole time.

The usual pattern: the counter writes an order slip, promises a text when ready, and the customer leaves. Slips stack on a spike. Back-room staff pull slips one at a time and print. Accepting the order takes seconds; doing the work happens later. That separation is working [[asynchronous|asynchronously]].

The spike is a [[queue]]: durable (or at least persistent) storage for pending jobs. The back-room staff are [[worker|workers]]: processes that dequeue jobs and run the slow work. Inserting a queue splits "accept" from "execute" and lets each side scale on its own timeline.

The counter stays fast because acceptance no longer includes print time. Bursts pile up as backlog on the spike instead of overloading the till. You can add printers without rewriting how orders are taken, so worker count and counter capacity scale on separate clocks.

You still do not get free work. Every slip still needs a human or machine eventually. If arrivals stay above print capacity, the spike grows and customers at the bottom wait longer; the queue moved waiting from the lobby to the backlog. Queues also add a component that must keep jobs safe: if the spike is knocked over, orders vanish. The app warns about a queue that is not durable for that reason.

Queues relocate waiting. Demand stays. Be explicit about which you need.

::: quiz
A queue sits between a website that accepts orders and workers that fill them. During a sudden rush of orders, what does the queue do?
- [ ] It makes the extra orders disappear, so the workers never see them.
- [x] It holds the extra orders until the workers can reach them, so the website stays quick but some customers wait longer.
- [ ] It makes each worker faster, so the orders are all finished at the normal time.
- [ ] It turns the extra orders away so that none of them wait.
> A queue does not remove work or speed up the workers. It lets the website accept orders quickly and holds them until a worker is free, so the waiting moves to the back of the system.
:::

## Backlog and drain rate {#m2-backlog-and-drain}

A café takes orders at the till and makes drinks at the machine. Two baristas finish 20 drinks a minute together. That completion rate is the drain rate of the order queue.

On a quiet morning, 10 orders/min arrive. Drain exceeds arrival, so the queue stays short and baristas idle between drinks.

At lunch, 30 orders/min arrive for ten minutes while drain stays at 20. Each minute adds 10 unpaid orders. After one minute the [[backlog]] is 10; after five, 50; after ten, 100. Backlog grows at (arrival − drain) for as long as arrival is higher.

Backlog maps directly to wait time under FIFO: at 20 drinks/min with 100 ahead of you, expect about five minutes. The till can still accept instantly while customers in the queue suffer. Health checks that only watch the HTTP edge miss this failure mode.

When the rush ends and arrivals fall to 10/min, drain of 20 clears 10 backlog per minute; the 100 waiting drinks take another ten minutes. A finite burst can be absorbed if you have spare drain afterward. That is when the queue earns its keep.

If arrival never falls below drain (25/min in, 20/min out), backlog grows forever at 5/min. Latency climbs without a hard error at the till. The app reports a backlog that keeps growing; it is one of the easiest failures to miss in monitoring that only watches error rates.

Drain is also shared. If the same baristas clean the machine hourly, drink throughput drops during that work. Scheduled jobs (nightly purge of old records, report generation) compete for the same worker capacity as queue consumers. If they do not fit in the spare, backlog grows. The app treats scheduled jobs and queue work as competing consumers of the same pool for that reason.

::: demo d2-queue
:::

## Retries and idempotency {#m2-retries-and-idempotency}

A shop awards a loyalty stamp per purchase. The till enqueues each receipt; a worker adds a stamp to the customer's card. Workers crash mid-job, networks drop acknowledgements, and it becomes unclear whether a stamp was applied.

Retrying is the standard recovery: the queue redelivers the job. In this app a worker has a retry-count setting. Redelivery means the same logical job can run more than once.

If the first attempt applied the stamp and then failed to acknowledge, the retry applies a second stamp. One purchase, two stamps. The fix is idempotency. An [[idempotent]] operation has the same effect whether it runs once or N times. "Add one stamp" creates a new side effect each time. "Set stamp state for receipt 8841" or "record that receipt 8841 was counted, and skip if already present" leaves the card unchanged on a repeat. The usual implementation is a unique job key plus a store of completed keys: on seeing a known key, return the prior result and do no new side effect.

Idempotency has a cost: a lookup (and sometimes a write) per attempt, plus storage for keys until they expire. The app charges a small capacity cost and warns when retries are enabled without idempotency.

Be precise about what a queue promises. It buffers jobs and redelivers on failure, which suits work that can be made safely repeatable. An append-only event log that many independent consumers replay from arbitrary offsets is a different tool. A later lesson covers streams; the distinction matters for audit and fan-out. For now, treat a queue as "do this work," with at-least-once delivery unless you build stronger guarantees yourself.

::: quiz
A worker adds a loyalty stamp when it receives a receipt. A crash means some receipts are processed twice. Which change makes retries safe?
- [ ] Never retry a failed job, so nothing is ever repeated.
- [ ] Add more workers, so jobs finish before anything can fail.
- [x] Record which receipts have been counted and check that record first, so a repeated receipt changes nothing.
- [ ] Make the stamp count bigger, so a repeat matters less.
> Repeating a job is safe when repeating it has no extra effect. Remembering which receipts have already been counted makes the job idempotent. Refusing to retry would lose stamps instead.
:::

## Outside services, timeouts and limits {#m2-providers-timeouts-limits}

Some work lives in someone else's system: a delivery app calling a postcode lookup to geocode an address. That dependency is a [[third-party provider]]. You do not control its latency or its price, and you do not control how it fails, yet your users feel them.

A [[rate limit]] caps how many calls the provider accepts in a window. Calls above the cap are rejected even if your fleet is idle. In this app each provider has a rate-limit setting your design must respect. A queue helps by smoothing bursts into a steady send rate under the cap. The same idea appears on your side as a Rate Limiter block: you cap how much one client may ask of you so one noisy tenant cannot exhaust shared capacity.

Time is the other hard bound. Providers stall or hang. If your server waits unbounded, your own request threads (or connection slots) fill with waiters and your site fails even though the failure started elsewhere. A [[timeout]] is the maximum wait before you abandon the call. It caps blast radius: no caller waits longer than the timeout.

A timeout only tells you that your side stopped waiting. The provider may have received the request, completed it, and sent a response that arrived after you gave up. Retrying after a timeout without idempotency can double-charge a card or double-book a seat. That is why the previous page exists.

Instead of waiting forever you choose a [[fallback]]: behaviour when the answer does not arrive in time. For postcode lookup, show the typed address and continue checkout. Fallbacks only work when a degraded path is acceptable. Some calls have none; then the timeout converts a hang into a clear error.

Timeouts can also be too aggressive. If the provider's normal p50 is 200 ms and you time out at 100 ms, you discard healthy responses constantly. The app flags a timeout shorter than the dependency's normal response time.

::: demo d2-timeout
:::

## Optional work and failure isolation {#m2-optional-work-isolation}

A recipe page shows the recipe and, below it, a "you might also like" row. Suggestions come from a separate code path that is sometimes slow.

The recipe is critical: without it the page is useless. Suggestions are optional: the page is still good without them. Critical vs optional is a product decision you should make explicitly, because it decides what is allowed to fail.

If suggestion code shares the same server process (or the same thread pool) as recipe code, they share fate. A slow suggestions call consumes workers and sockets that recipes need, and recipe latency rises with it. [[shared fate]] means one feature's trouble becomes another's. An optional feature has taken the critical path down.

You can isolate in a couple of ways. Run the optional work on its own block (separate service or worker pool) so its saturation cannot starve recipe capacity. Put a [[circuit breaker]] on the call from recipe to suggestions: after enough timeouts or errors, stop calling for a cooldown and use the fallback (omit the row). Isolation limits resource damage; the breaker stops waiting on a dead dependency.

Both cost something. A separate block is another bill. A breaker needs a timeout calibrated above healthy latency, or you "open" permanently on a good day. The app reports optional features skipped when nothing is actually broken.

The same isolation rule applies to scheduled cleanup: do not run heavy batch jobs on the servers that answer interactive traffic if you can help it. They compete for the same cores and caches.

::: quiz
The "you might also like" row becomes very slow, and recipe pages slow down with it. What is the most direct cause?
- [ ] The recipe database ran out of space.
- [x] The suggestions and the recipe code share a server, so the slow optional feature uses the capacity the critical one needs.
- [ ] Visitors asked for too many recipes at once.
- [ ] The suggestions row is displayed in the wrong place on the page.
> When an optional feature and a critical one share a server, they share a fate. Running the optional one separately, or calling it behind a circuit breaker with a fallback, keeps its slowness away from the recipe.
:::

Optional, and not scored: think of a feature in an app you use that you could live without. What would you want the app to do when that feature broke?

::: summary
- A queue lets a system accept work quickly and do it later. It holds work and moves the waiting to the back, but it does not make work disappear.
- The backlog grows whenever work arrives faster than it is finished, and wait times grow with it. A burst that ends can be absorbed. A rate that never falls below the drain rate cannot.
- A job may run more than once, so make it idempotent: repeating it must have no extra effect.
- An outside service has its own rate limit and speed. A timeout bounds how long you wait; on its own it cannot tell you the call failed. A fallback is what you do instead.
- Decide which features are critical and which are optional. Keep optional work from sharing a fate with critical work, by separating it or calling it behind a circuit breaker.
:::
