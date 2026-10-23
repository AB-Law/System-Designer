import { analyze } from "../src/sim/analyze";
import { BLOCK_MAP, defaultCfg, money } from "../src/blocks";
import pb from "../src/problems/pastebin.json";
import us from "../src/problems/url_shortener.json";
import nt from "../src/problems/notification.json";
import lb from "../src/problems/library_management.json";
import type { Problem } from "../src/types";
const mk = (id: string, blockId: string, over: Record<string, unknown> = {}, caps?: string[]) => ({ id, blockId, cfg: { ...defaultCfg(BLOCK_MAP[blockId]), ...over }, responsibilities: [] as string[], capabilities: caps });
const e = (s: string, t: string, kind: "sync" | "async" = "sync") => ({ id: s + t + kind, source: s, target: t, kind });
const show = (name: string, P: Problem, d: any) => {
  const r = analyze(d, P);
  console.log(`\n== ${P.id} / ${name}: score ${r.score}, cost ${money(r.cost)} / ${money(r.budget!)}`);
  for (const s of r.scenarios) console.log("  ", s.scenarioId.padEnd(15), "served", s.served.toFixed(2), "lat", String(Math.round(s.latencyMs)).padStart(4), s.pass ? "PASS" : "FAIL", s.notes.join(" | ").slice(0, 170));
  console.log("   req:", r.requirements.map((x) => x.id.replace("r-", "") + "=" + (x.met === null ? "ai" : x.met ? "ok" : "NO")).join(" "));
  const f = r.findings.filter((x) => x.severity === "bad" || x.severity === "warn").map((x) => x.id);
  if (f.length) console.log("   issues:", f.join(", "));
};
const only = process.argv[2];

// ---- pastebin
{
  const P = pb as unknown as Problem; const u = mk("u", "user", { users: 1500000, reqPerUser: 0.01 });
  const base = (srv: any, extra: any[], edges: any[], o2: { lock?: string } = {}) => ({ nodes: [u, mk("cdn", "cdn", { cacheApi: true, hitRatio: 0.9 }), mk("lb", "load_balancer"), srv, mk("c", "cache", { hitRatio: 0.95, replicas: 2 }), mk("db", "database", { readReplicas: 2, consistency: o2.lock ?? "Row locks" }), ...extra], edges: [e("u", "cdn"), e("cdn", "lb"), e("lb", "s"), e("s", "c"), e("c", "db"), ...edges] });
  const adChain = [mk("ad", "service", { capacity: 1000, replicas: 2 }, ["ads"]), mk("ac", "cache", { hitRatio: 0.9 }), mk("tp", "third_party", { capacity: 800, kind: "Ad network" }), mk("w", "worker", { capacity: 200, replicas: 4, idempotent: true }, ["retention"])];
  const chainEdges = [e("s", "ad"), e("ad", "ac"), e("ac", "tp"), e("w", "db")];
  if (!only || only === "pb") {
    show("microservices + ad cache + breaker", P, base(mk("s", "server", { capacity: 1000, replicas: 8, circuitBreaker: true, timeoutMs: 60, idStrategy: "Counter range per server" }, ["serve_paste", "issue_link"]), adChain, chainEdges));
    show("ads not connected to provider", P, base(mk("s", "server", { capacity: 1000, replicas: 8, circuitBreaker: true, timeoutMs: 60, idStrategy: "Counter range per server" }, ["serve_paste", "issue_link"]), [adChain[0], adChain[3]], [e("s", "ad"), e("w", "db")]));
    show("ad service straight to provider (no cache)", P, base(mk("s", "server", { capacity: 1000, replicas: 8, circuitBreaker: true, timeoutMs: 60, idStrategy: "Counter range per server" }, ["serve_paste", "issue_link"]), [adChain[0], adChain[2], adChain[3]], [e("s", "ad"), e("ad", "tp"), e("w", "db")]));
    show("breaker timeout too short (10ms)", P, base(mk("s", "server", { capacity: 1000, replicas: 8, circuitBreaker: true, timeoutMs: 20, idStrategy: "Counter range per server" }, ["serve_paste", "issue_link"]), adChain, chainEdges));
    const mkS = (idStrategy: string) => mk("s", "server", { capacity: 1000, replicas: 8, circuitBreaker: true, timeoutMs: 60, idStrategy }, ["serve_paste", "issue_link"]);
    show("no ID strategy", P, base(mkS("None"), adChain, chainEdges));
    show("central locked counter for ids", P, base(mkS("Central counter (locked)"), adChain, chainEdges));
    show("random ids, but the database does not lock", P, base(mkS("Random + collision check"), adChain, chainEdges, { lock: "Eventual" }));
    show("no breaker", P, base(mk("s", "server", { capacity: 1000, replicas: 8, idStrategy: "Counter range per server" }, ["serve_paste", "issue_link"]), adChain, chainEdges));
  }
}
// ---- url shortener
if (!only || only === "us") {
  const P = us as unknown as Problem; const u = mk("u", "user", { users: 2000000, reqPerUser: 0.002 });
  const good = (consistency: string, countersOnServer = false, o: { ids?: string } = {}) => ({
    nodes: [u, mk("lb", "load_balancer", { instances: 2, capacity: 20000 }),
      mk("s", "server", { capacity: 1000, replicas: 7, autoscale: true, maxReplicas: 16, circuitBreaker: true, idStrategy: o.ids ?? "Counter range per server" }, countersOnServer ? ["redirect", "create_link", "click_count"] : ["redirect", "create_link"]),
      mk("c", "cache", { hitRatio: 0.97, replicas: 2 }), mk("db", "database", { capacity: 1500, engine: "Key-value", readReplicas: 1, consistency }), mk("q", "queue", { partitions: 2, capacity: 10000 }),
      mk("w", "worker", { capacity: 200, replicas: 4, autoscale: true, maxReplicas: 12, idempotent: true, batchSize: 100 }, ["click_count"]), mk("x", "worker", { capacity: 200, replicas: 2, idempotent: true }, ["expiry"])],
    edges: [e("u", "lb"), e("lb", "s"), e("s", "c"), e("c", "db"), ...(countersOnServer ? [] : [e("s", "q", "async"), e("q", "w"), e("w", "db")]), e("x", "db")],
  });
  show("queue-based counter, row locks", P, good("Row locks"));
  show("eventual consistency (no lock)", P, good("Eventual"));
  show("counter inside redirect server", P, good("Row locks", true));
  show("no ID strategy", P, good("Row locks", false, { ids: "None" }));
}
// ---- notification
if (!only || only === "nt") {
  const P = nt as unknown as Problem; const u = mk("u", "user", { users: 200000, reqPerUser: 0.025 });
  const d = (idem: boolean, withProvider: boolean) => ({
    nodes: [u, mk("lb", "load_balancer", { instances: 2, capacity: 20000 }), mk("api", "server", { capacity: 1000, replicas: 7, autoscale: true, maxReplicas: 20, circuitBreaker: true }, ["accept"]),
      mk("pf", "service", { capacity: 2500, replicas: 2, autoscale: true, maxReplicas: 6 }, ["prefs"]), mk("pc", "cache", { hitRatio: 0.9, replicas: 1 }), mk("db", "database", { capacity: 2000, readReplicas: 1 }),
      mk("q", "queue", { partitions: 2, capacity: 10000 }), mk("w", "worker", { capacity: 200, replicas: 6, autoscale: true, maxReplicas: 18, idempotent: idem, batchSize: 4 }, ["deliver"]),
      ...(withProvider ? [mk("tp", "third_party", { capacity: 3000, kind: "Email / SMS" })] : []), mk("x", "worker", { capacity: 200, replicas: 2, idempotent: true }, ["purge"])],
    edges: [e("u", "lb"), e("lb", "api"), e("api", "pf"), e("pf", "pc"), e("pc", "db"), e("api", "q", "async"), e("q", "w"), ...(withProvider ? [e("w", "tp")] : []), e("x", "db")],
  });
  show("good", P, d(true, true));
  show("worker not idempotent", P, d(false, true));
  show("no provider connected", P, d(true, false));
}
// ---- library
if (!only || only === "lb") {
  const P = lb as unknown as Problem; const u = mk("u", "user", { users: 60000, reqPerUser: 0.05 });
  const d = (consistency: string, idx: boolean) => ({
    nodes: [u, mk("lb", "load_balancer", { instances: 2, capacity: 20000 }), mk("s", "server", { capacity: 1000, replicas: 6, autoscale: true, maxReplicas: 18 }, ["search", "checkout"]),
      mk("c", "cache", { hitRatio: 0.8, replicas: 1 }), ...(idx ? [mk("si", "search_index", { capacity: 3000, replicas: 2 })] : []), mk("db", "database", { capacity: 1600, readReplicas: 1, consistency, indexes: ["books:isbn", "loans:member_id,due_date"] }), mk("w", "worker", { capacity: 200, replicas: 1, idempotent: true }, ["reminders"]), mk("tp", "third_party", { capacity: 500, kind: "Email / SMS" })],
    edges: [e("u", "lb"), e("lb", "s"), e("s", "c"), ...(idx ? [e("c", "si")] : [e("c", "db")]), e("s", "db"), e("w", "tp"), e("w", "db")],
  });
  show("row locks + search index", P, d("Row locks", true));
  show("no locks", P, d("Eventual", true));
  show("no search index", P, d("Row locks", false));
}
