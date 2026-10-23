// The data model: indexes, sort order, paging, shard keys and index overhead each change what a query costs.
import { planQueries } from "../src/sim/data";
import { analyze } from "../src/sim/analyze";
import lb from "../src/problems/library_management.json";
import ms from "../src/problems/messaging_app.json";
import tk from "../src/problems/ticket_booking.json";
import mm from "../src/problems/metrics_monitoring.json";
import pay from "../src/problems/payment.json";
import fd from "../src/problems/food_delivery.json";
import nf from "../src/problems/news_feed.json";
import type { Problem } from "../src/types";

const L = lb as unknown as Problem;
const M = ms as unknown as Problem;
const T = tk as unknown as Problem;
const X = mm as unknown as Problem;
const PAY = pay as unknown as Problem;
const FD = fd as unknown as Problem;
const NF = nf as unknown as Problem;
let fails = 0;
const check = (name: string, ok: boolean, extra = "") => {
  console.log((ok ? "PASS " : "FAIL ") + name + (extra ? "  " + extra : ""));
  if (!ok) fails++;
};
const plan = (P: Problem, cfg: Record<string, unknown>) => planQueries(P, cfg, P.capabilities ?? []);
const q = (P: Problem, cfg: Record<string, unknown>, id: string) => plan(P, cfg).queries.find((x) => x.id === id)!;
const f = (x: number) => x.toFixed(2);

// ---- library: composite index with the sort column last
const none = {};
const full = { indexes: ["books:isbn", "loans:member_id,due_date"] };
check("no indexes: a lookup by ISBN reads the whole table", q(L, none, "find_book").scan && q(L, none, "find_book").factor > 1000, `x${Math.round(q(L, none, "find_book").factor)}`);
check("an index on isbn makes that lookup as cheap as it can be", q(L, { indexes: ["books:isbn"] }, "find_book").factor < 1.05);
check("index on member_id alone: still sorts in memory", q(L, { indexes: ["loans:member_id"] }, "my_loans").factor > 1.4 && q(L, { indexes: ["loans:member_id"] }, "my_loans").factor < 3, `x${f(q(L, { indexes: ["loans:member_id"] }, "my_loans").factor)}`);
check("index on (member_id, due_date): no sort, as cheap as it can be", q(L, full, "my_loans").factor < 1.05, `x${f(q(L, full, "my_loans").factor)}`);
check("index in the wrong order (due_date, member_id) does not help the filter", q(L, { indexes: ["loans:due_date,member_id"] }, "my_loans").scan);
check("the right data model has no overhead", plan(L, full).readFactor < 1.05 && plan(L, full).writeFactor < 1.05, `read x${f(plan(L, full).readFactor)}, write x${f(plan(L, full).writeFactor)}`);

const lots = { indexes: ["books:isbn", "loans:member_id,due_date", "loans:book_id", "loans:due_date", "loans:member_id", "loans:book_id,member_id"] };
check("indexes nobody needs make every write dearer", plan(L, lots).writeFactor > 1.5, `write x${f(plan(L, lots).writeFactor)}`);
check("... and cost money", plan(L, lots).indexCost > plan(L, full).indexCost * 2, `$${Math.round(plan(L, lots).indexCost)} vs $${Math.round(plan(L, full).indexCost)}`);
check("junk or unknown indexes are ignored, not trusted", plan(L, { indexes: ["nope:x", "books:zzz", "books:isbn,isbn", "books:isbn", "books:isbn", "../../etc:passwd"] }).indexes.length === 1);
check("at most six indexes count", plan(L, { indexes: Array.from({ length: 12 }, (_, i) => `loans:due_date,member_id,book_id`.split(",").slice(0, 1 + (i % 3)).join(",")).map((s) => "loans:" + s.replace("loans:", "")) }).indexes.length <= 6);

// ---- the whole simulator sees it
const design = (db: Record<string, unknown>) => ({
  nodes: [
    { id: "u", blockId: "user", cfg: { users: 60000, reqPerUser: 0.05 }, responsibilities: [] },
    { id: "lb", blockId: "load_balancer", cfg: { instances: 2, capacity: 20000 }, responsibilities: [] },
    { id: "s", blockId: "server", cfg: { capacity: 1000, replicas: 6, autoscale: true, maxReplicas: 18 }, responsibilities: [], capabilities: ["search", "checkout"] },
    { id: "si", blockId: "search_index", cfg: { capacity: 3000, replicas: 2 }, responsibilities: [] },
    { id: "db", blockId: "database", cfg: { capacity: 1600, readReplicas: 1, consistency: "Row locks", engine: "Relational", shards: 1, indexes: [], stores: [], ...db }, responsibilities: [] },
  ],
  edges: [["u", "lb"], ["lb", "s"], ["s", "si"], ["s", "db"]].map(([a, b]) => ({ id: a + b, source: a, target: b, kind: "sync" as const })),
});
const good = analyze(design(full), L);
const bad = analyze(design(none), L);
check("with the right indexes the database is never saturated", good.scenarios.every((s) => !s.saturated.includes("db")), good.scenarios.map((s) => s.scenarioId + ":" + s.saturated.join("/")).join(" "));
check("with none the database saturates, and the requirement says why", bad.scenarios.every((s) => s.saturated.includes("db") || s.nodes["db"]?.incoming === 0 || s.nodes["db"].utilization > 1) && bad.requirements.find((r) => r.id === "r-queries")?.met === false, bad.requirements.find((r) => r.id === "r-queries")?.detail.slice(0, 90));
check("the findings name the scan", bad.findings.some((x) => x.id.startsWith("query-scan")));
check("the right data model meets the requirement", good.requirements.find((r) => r.id === "r-queries")?.met === true);
check("the right data model costs a little for its indexes", good.cost > analyze(design(none), L).cost);

// ---- messaging: paging and shard keys
const msg = { indexes: ["messages:conversation_id,sent_at"] };
check("offset paging makes deep pages dearer", q(M, { ...msg, pagination: "Offset (page numbers)" }, "load_chat").factor > 2, `x${f(q(M, { ...msg, pagination: "Offset (page numbers)" }, "load_chat").factor)}`);
check("keyset paging does not", q(M, { ...msg, pagination: "Keyset (after the last item)" }, "load_chat").factor < 1.05);
const keyset = { ...msg, pagination: "Keyset (after the last item)", shards: 8 };
check("shard key = conversation: a chat is asked of one shard", !q(M, { ...keyset, shardKeys: ["messages:conversation_id"] }, "load_chat").scatter && plan(M, { ...keyset, shardKeys: ["messages:conversation_id"] }).skew > 0.9, `skew ${f(plan(M, { ...keyset, shardKeys: ["messages:conversation_id"] }).skew)}`);
check("shard key = sender: every shard is asked", q(M, { ...keyset, shardKeys: ["messages:sender_id"] }, "load_chat").scatter && q(M, { ...keyset, shardKeys: ["messages:sender_id"] }, "load_chat").factor > 7);
check("no shard key chosen: every shard is asked too", q(M, keyset, "load_chat").scatter);
check("shard key = time: one hot shard however many there are", plan(M, { ...keyset, shardKeys: ["messages:sent_at"] }).skew < 0.25, `skew ${f(plan(M, { ...keyset, shardKeys: ["messages:sent_at"] }).skew)}`);
check("a hot shard key raises a finding", analyze({ nodes: [{ id: "u", blockId: "user", cfg: { users: 1000, reqPerUser: 1 }, responsibilities: [] }, { id: "db", blockId: "database", cfg: { ...keyset, shardKeys: ["messages:sent_at"], capacity: 1500 }, responsibilities: [] }], edges: [] }, M).findings.some((x) => x.id.startsWith("shard-skew")));

// ---- tickets: filter columns, then status, then the sort column
const t1 = q(T, { indexes: ["seats:event_id"] }, "free_seats").factor;
const t2 = q(T, { indexes: ["seats:event_id,status"] }, "free_seats").factor;
const t3 = q(T, { indexes: ["seats:event_id,status,seat_no"] }, "free_seats").factor;
check("each extra matching column makes the seat search cheaper", t1 > t2 && t2 > t3 && t3 < 1.05, `x${f(t1)} > x${f(t2)} > x${f(t3)}`);

// ---- metrics: a write-heavy store should not carry spare indexes
const ok1 = plan(X, { indexes: ["points:metric_id,ts"] });
const many = plan(X, { indexes: ["points:metric_id,ts", "points:ts", "points:value", "points:metric_id", "points:value,ts"] });
check("one index serves the series read", q(X, { indexes: ["points:metric_id,ts"] }, "read_series").factor < 1.05 && ok1.writeFactor < 1.05);
check("five indexes make each write about twice as dear", many.writeFactor > 1.8, `write x${f(many.writeFactor)}`);
check("no index: reading a series scans 20 billion rows", q(X, {}, "read_series").scan && q(X, {}, "read_series").extraMs > 1e6);


// ---- payment: two lookups by different keys on one sharded ledger
const led = { shards: 2, indexes: ["ledger_entries:idem_key", "ledger_entries:account_id"] };
check("payment: with no index the duplicate check scans two billion rows", q(PAY, {}, "dup_check").scan && q(PAY, {}, "dup_check").factor > 1e5);
check("payment: one index on the key and one on the account serve both lookups", q(PAY, { indexes: led.indexes }, "dup_check").factor < 1.05 && q(PAY, { indexes: led.indexes }, "balance").factor < 1.05);
check("payment: sharding by account routes the balance but not the duplicate check", !q(PAY, { ...led, shardKeys: ["ledger_entries:account_id"] }, "balance").scatter && q(PAY, { ...led, shardKeys: ["ledger_entries:account_id"] }, "dup_check").scatter);
check("payment: sharding by key is the mirror image, so neither choice is free", q(PAY, { ...led, shardKeys: ["ledger_entries:idem_key"] }, "dup_check").factor < 1.05 && q(PAY, { ...led, shardKeys: ["ledger_entries:idem_key"] }, "balance").scatter);
check("payment: sharding by time leaves most of the capacity unused", plan(PAY, { ...led, shards: 4, shardKeys: ["ledger_entries:created_at"] }).skew < 0.35);

// ---- food delivery: the customer alone nearly narrows it; the status adds nothing
const oc = (idx: string[]) => q(FD, { indexes: idx }, "open_orders").factor;
check("food: no index means a scan of 150 million orders", q(FD, {}, "open_orders").scan && q(FD, {}, "open_orders").factor > 1e4);
check("food: an index on the customer alone is nearly as good as it gets", oc(["orders:customer_id"]) < 1.1, `x${f(oc(["orders:customer_id"]))}`);
check("food: adding the status to the index buys almost nothing", oc(["orders:customer_id"]) - oc(["orders:customer_id,status"]) < 0.1);
check("food: an index on the status alone is no help", q(FD, { indexes: ["orders:status"] }, "open_orders").factor > 1e3);
check("food: the dish lookups use the primary key and need no index", q(FD, {}, "stock").factor < 1.05 && q(FD, {}, "reserve").factor < 1.05);

// ---- news feed: scrolling back, and a feed that must keep up with fan-out writes
const nfIdx = { indexes: ["feed_items:user_id,created_at"] };
check("feed: the right index serves the top of a feed", q(NF, { ...nfIdx, pagination: "Keyset (after the last item)" }, "read_feed").factor < 1.05);
check("feed: offset paging makes scrolling back dearer", q(NF, { ...nfIdx, pagination: "Offset (page numbers)" }, "read_feed").factor > 1.5);
check("feed: an index on the user alone sorts five thousand entries in memory", q(NF, { indexes: ["feed_items:user_id"] }, "read_feed").factor > 5, `x${f(q(NF, { indexes: ["feed_items:user_id"] }, "read_feed").factor)}`);
check("feed: indexing by time instead leaves the read scanning ten billion rows", q(NF, { indexes: ["feed_items:created_at"] }, "read_feed").scan);
check("feed: a second index makes every fan-out write dearer", plan(NF, { indexes: ["feed_items:user_id,created_at", "feed_items:post_id"] }).writeFactor > 1.2);
check("feed: sharding by reader keeps a feed on one shard and spreads writes", !q(NF, { ...nfIdx, shards: 4, shardKeys: ["feed_items:user_id"] }, "read_feed").scatter && plan(NF, { ...nfIdx, shards: 4, shardKeys: ["feed_items:user_id"] }).skew > 0.95);

// ---- a problem without a data model is untouched
const noDm = { ...L, dataModel: undefined } as Problem;
check("without a data model nothing changes", plan(noDm, full).readFactor === 1 && plan(noDm, full).indexCost === 0);

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
