---
title: Real-time decisions and money
minutes: 30
---

## When a whole region is lost {#m5-multi-region-failure}

A weather-alert app runs all servers and its database in Virginia. Virginia loses power. Europe sees nothing: every dependency failed together. Module 1's [[region|regions]] lesson already warned that one place is one fate.

Running in a second region only works if the data is there too. Adding app servers in Europe while leaving the database in Virginia helps latency while Virginia is healthy (Europeans hit a nearby app tier). When Virginia dies, those European servers have no durable state to read or write. Compute without data does not restore the product.

The working pattern: app servers in Europe plus a database replica (or other promoted copy) in Europe. On Virginia loss, the copy is promoted to primary and local servers continue. Failover is what makes the second region real.

Sizing is the expensive part. After failover the surviving region receives the full traffic load, including what used to land elsewhere. If it was provisioned only for its regional fraction, it overloads under failover. A true standby must be able to carry 100% of peak, which you pay for even on quiet days. That is the availability vs cost trade: spare capacity you hope never to need.

The app can take a whole region down. A database with a remote copy fails over at reduced modelled capacity. Failover duration and the last unreplicated writes stay off-screen. In production, asynchronous replicas can lag, so a sudden primary loss can drop the newest commits. Call that out when you explain a multi-region design.

::: demo d5-region-failure
:::

::: quiz
Servers run in two regions, but the database is only in the first. The first region is lost. What happens?
- [ ] The second region's servers carry on, because they are still running.
- [x] The second region's servers are running but cannot serve most requests, because the data was in the first region.
- [ ] The database moves to the second region by itself and nothing is lost.
- [ ] Requests are answered from the load balancer's memory.
> Servers need the data. A copy of the data in the second region, ready to take over, is what lets it carry on.
:::

## Matching people with things nearby {#m5-live-matching}

Forty people request the nearest free festival bike in the same second. Forty bikes sit across four areas. The system must assign each person a bike without giving the same bike twice.

You need a nearby free bike, and you need an exclusive claim on it. A geographic index (Module 4) answers "near" without scanning the country. The [[lock]] idea from Module 1 stops two users both hearing "it's yours."

Lock granularity decides latency under contention. One festival-wide lock is correct but totally serial: forty claims at 20 ms each put the last waiter near 800 ms in line. Per-bike locks let unrelated claims proceed in parallel; contention only happens when two people want the same bike, and the loser tries the next nearest. Lock the resource being granted. Locking the whole festival serialises everyone.

Locks enforce correctness. Supply stays whatever it was. If everyone crowds one area, that area empties regardless of locking quality. In the demo, a surge in one area is turned away when bikes run out. Remedies are product and ops (more bikes, wider search radius, a waitlist), while the systems lever is spreading find-and-claim work across shards of the map (Module 3) so one hot neighbourhood does not serialise the whole festival.

The demo covers a geo index, area shards, exclusive claim, and a capability surge. It checks that claims are protected. Whether you lock per bike or per city is something you justify in writing.

::: demo d5-matching
:::

## Retries, keys and ledgers {#m5-payment-retries-and-ledgers}

You tap Pay for a £12 gym fee. The UI hangs. You tap twice more. The card might charge once, or it might charge for every tap.

If each tap is a new payment intent, you may pay £36. If every tap carries the same idempotency key minted when the customer started checkout, the processor recognises a duplicate and charges £12 once. That is [[idempotent]] behaviour from Module 2 applied where money is on the line. A missing or timed-out response leaves the outcome unknown; the charge may have succeeded and only the reply was lost.

So the client generates a key once and resends it on every retry. The first successful processing stores the outcome under that key; later requests with the same key return the stored outcome and perform no new side effect. Keys cost a lookup (and storage) on the path. The app charges a small capacity and latency cost for enabling them.

The economic truth lives in a ledger: an append-only list of entries. A payment posts a balanced pair (or set) of lines: money out of one account, money into another, summing to zero so the books stay consistent. Mistakes stay in the history; you append a reversing pair. That preserves a full audit trail.

The lines in a pair must commit in one [[transaction]] (Module 3). A crash after the debit alone invents vanishing money. In the app, a ledger that must stay correct needs a relational database at Serializable isolation so concurrent payments cannot interleave into an inconsistent state. The write-throughput cost of that isolation was covered in Module 3.

Idempotency keys and transactional settings are what the app checks. It will not inject duplicate HTTP taps for you. How retries are recognised is part of your written explanation.

::: demo d5-payment-taps
:::

## Checking your books against theirs {#m5-reconciliation}

A shop till says £1,204. The bank statement says £1,226. Either side (or both) can be wrong: a charge that never settled, a settlement whose callback never arrived, a mistyped amount. Mature systems do not wait for angry customers; they compare books on a schedule.

Reconciliation matches your payment list to the provider's statement by payment id (and amount). Each line falls into a bucket: both agree; both present but amounts differ; only we have it; only they have it. "Only we" may be a charge that never cleared. "Only they" may be a successful charge whose response you lost, leaving a customer billed without a fulfilled order.

Timing is its own bucket. A payment near midnight may land on tomorrow's statement, and that is expected cut-off behaviour rather than a mismatch. A good job knows the provider's cut-off and parks those lines for the next run instead of paging a human every night.

On real mismatches, prefer report-and-review (or a narrow, approved auto-rule) over silent "fixes." Quietly adjusting money is how small diffs become fraud-shaped holes.

Reconciliation is background work (Module 2): scheduled, capacity-consuming, no user waiting on the HTTP path. Hosting it on the same servers as the payment API lets a heavy compare steal latency from checkout. The app shows background jobs consuming capacity on their host block. It does not actually diff two ledgers; it checks that the job is placed somewhere sensible.

::: demo d5-reconcile
:::

## Time and money budgets {#m5-latency-and-cost-budgets}

A pizza shop's order API must answer within 120 ms and stay under $500/month. One request does five things: check stock, price the order, save it, apply a loyalty discount, suggest an upsell. Both budgets have to hold at once.

Latency first. End-to-end wait is the sum of work on the critical path before the response. Stock, price, and save are essential and take 50 ms together. Discount takes 45 ms; suggestion 70 ms. Running all five inline totals 165 ms: over the time budget before any network jitter.

An optional step can sit in different places on the path.

1. Inline before the response: adds its full latency to every request.
2. After the response, via a queue and worker: removes it from the user-visible path, but adds queue/worker cost to the money budget (Module 2).
3. Inline with a time limit: wait up to N ms, then proceed with a fallback (skip discount / skip suggestion). That is a [[timeout]] or [[circuit breaker]] pattern from Module 2. It caps damage on a bad day; you discard that step's result when slow.
4. Omit the feature: saves time and money, loses the product behaviour.

Money follows. Every block and every bit of machinery that moves work off the path has a monthly cost. Speed purchases spend the cost budget. In the demo, backgrounding both optionals fits time and can break money; putting the discount behind a short limit and dropping the suggestion can fit both. You will rarely hit a perfect answer. Aim for trade-offs you can explain.

On a bad day, when an optional dependency is 10× slower: inline with no limit sinks the page; backgrounded work does not touch user latency; a time-limited call costs at most the limit. Same isolation lesson as Module 2: a nice-to-have must not decide whether the essential path succeeds.

The app sums latency along the request path and monthly cost of blocks. Tail-latency detail beyond what it already reports is left out.

::: demo d5-budget
:::

::: quiz
A page is over its time budget because of an optional suggestion that sometimes hangs. Which change protects the answer best, and costs the least?
- [ ] Make the whole page's servers twice as large.
- [ ] Wait for the suggestion however long it takes, so no customer misses it.
- [x] Put a time limit on the suggestion, so the page answers without it when it is slow.
- [ ] Remove the essential steps that the suggestion depends on.
> A time limit stops one slow optional step from deciding how long everyone waits. Bigger servers do not help when the cause is something waiting, and the essential steps must stay.
:::

Optional, and not scored: think of a time a payment or booking seemed to go through twice. What do you think the app could have kept to tell the second try from the first?

::: summary
- A second region helps only if it has servers and a copy of the data, and is sized to carry everything. A copy can be a moment behind, so a sudden failure can lose the latest changes.
- To match people to things nearby, find them with a geographic index and claim each one with a lock on that one thing. A lock makes the result correct. Supply stays whatever it was.
- A key sent with every retry lets a payment be done once. A ledger adds lines in pairs that sum to nothing, written together or not at all.
- Reconciliation compares your books with the provider's by id, sorts the differences, and sets timing aside. It reports real differences for a person to review. It runs in the background.
- Waiting time is the sum of the steps before the answer. Background work, time limits and leaving things out take steps off the path, and each choice spends money.
:::
