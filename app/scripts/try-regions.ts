// Reference and flawed designs for the problems that have users in several regions.
import { analyze } from "../src/sim/analyze";
import { BLOCK_MAP, defaultCfg, money } from "../src/blocks";
import us from "../src/problems/url_shortener.json";
import nf from "../src/problems/news_feed.json";
import pay from "../src/problems/payment.json";
import type { Problem } from "../src/types";

const mk = (id: string, blockId: string, over: Record<string, unknown> = {}, caps?: string[]) => ({
  id, blockId, cfg: { ...defaultCfg(BLOCK_MAP[blockId]), ...over }, responsibilities: [] as string[], capabilities: caps,
});
const e = (s: string, t: string, kind: "sync" | "async" = "sync") => ({ id: s + t + kind, source: s, target: t, kind });
export const EU = "Europe";
export const AP = "Asia Pacific";
const R: Record<string, string> = { us: "US East", eu: EU, ap: AP };

export const show = (name: string, P: Problem, d: any, quiet = false) => {
  const r = analyze(d, P);
  if (!quiet) {
    console.log(`\n== ${P.id} / ${name}: score ${r.score}, cost ${money(r.cost)} / ${money(r.budget!)}`);
    for (const s of r.scenarios) {
      const by = s.latencyByRegion ? " [" + Object.entries(s.latencyByRegion).map(([k, v]) => `${k} ${Math.round(v)}`).join(", ") + "]" : "";
      console.log("  ", s.scenarioId.padEnd(14), "served", s.served.toFixed(2), "lat", String(Math.round(s.latencyMs)).padStart(4) + by, s.pass ? "PASS" : "FAIL", s.notes.join(" | ").slice(0, 200));
    }
    const f = r.findings.filter((x) => x.severity === "bad" || x.severity === "warn").map((x) => x.id);
    if (f.length) console.log("   issues:", f.join(", "));
  }
  return r;
};

// ------------------------------------------------------------------ url shortener
export const urlShortener = (o: { regions?: string[]; dbCopies?: string[]; nearUsers?: boolean } = {}) => {
  const regions = o.regions ?? ["us", "eu", "ap"];
  const per: Record<string, { reps: number; max: number }> = { us: { reps: 7, max: 16 }, eu: { reps: 2, max: 6 }, ap: { reps: 2, max: 6 } };
  const nodes: any[] = [mk("u", "user", { users: 2000000, reqPerUser: 0.002 })];
  const edges: any[] = [];
  for (const r of regions) {
    nodes.push(
      mk("lb" + r, "load_balancer", { instances: 2, capacity: 20000, region: R[r] }),
      mk("s" + r, "server", { capacity: 1000, replicas: per[r].reps, autoscale: true, maxReplicas: per[r].max, circuitBreaker: true, idStrategy: "Counter range per server", region: R[r] }, ["redirect", "create_link"]),
      mk("c" + r, "cache", { hitRatio: 0.97, replicas: 1, region: R[r] }),
    );
    edges.push(e("u", "lb" + r), e("lb" + r, "s" + r), e("s" + r, "c" + r), e("c" + r, "db"), e("s" + r, "q", "async"));
  }
  nodes.push(
    mk("db", "database", { capacity: 1500, engine: "Key-value", readReplicas: regions.length > 1 ? 0 : 1, consistency: "Row locks", region: R.us, replicaRegions: (o.dbCopies ?? ["eu", "ap"]).map((x) => R[x]) }),
    mk("q", "queue", { partitions: 2, capacity: 10000, region: R.us }),
    mk("w", "worker", { capacity: 200, replicas: 4, autoscale: true, maxReplicas: 12, idempotent: true, batchSize: 100, region: R.us }, ["click_count"]),
    mk("x", "worker", { capacity: 200, replicas: 2, idempotent: true, region: R.us }, ["expiry"]),
  );
  edges.push(e("q", "w"), e("w", "db"), e("x", "db"));
  return { nodes, edges };
};

// ------------------------------------------------------------------ news feed
export const newsFeed = (o: { regions?: string[]; dbCopies?: string[] } = {}) => {
  const regions = o.regions ?? ["us", "eu", "ap"];
  const per: Record<string, { reps: number; max: number }> = { us: { reps: 10, max: 24 }, eu: { reps: 3, max: 8 }, ap: { reps: 3, max: 8 } };
  const nodes: any[] = [mk("u", "user", { users: 2000000, reqPerUser: 0.004 })];
  const edges: any[] = [];
  for (const r of regions) {
    nodes.push(
      mk("lb" + r, "load_balancer", { instances: 2, capacity: 20000, region: R[r] }),
      mk("app" + r, "server", { capacity: 1000, replicas: per[r].reps, autoscale: true, maxReplicas: per[r].max, circuitBreaker: true, timeoutMs: 40, region: R[r] }, ["read_feed"]),
      mk("tc" + r, "cache", { capacity: 50000, replicas: 1, hitRatio: 0.95, region: R[r] }),
      mk("rank" + r, "service", { capacity: 2000, replicas: r === "us" ? 5 : 2, autoscale: true, maxReplicas: r === "us" ? 12 : 6, region: R[r] }, ["rank"]),
    );
    edges.push(e("u", "lb" + r), e("lb" + r, "app" + r), e("app" + r, "tc" + r), e("tc" + r, "db"), e("app" + r, "rank" + r));
  }
  nodes.push(
    mk("db", "database", { capacity: 2000, engine: "Document", readReplicas: regions.length > 1 ? 0 : 1, indexes: ["feed_items:user_id,created_at"], pagination: "Keyset (after the last item)", region: R.us, replicaRegions: (o.dbCopies ?? ["eu", "ap"]).map((x) => R[x]) }),
    mk("post", "service", { capacity: 1000, replicas: 2, autoscale: true, maxReplicas: 10, region: R.us }, ["post"]),
    mk("st", "stream", { capacity: 10000, partitions: 2, region: R.us }),
    mk("fw", "worker", { capacity: 200, replicas: 6, autoscale: true, maxReplicas: 80, idempotent: true, batchSize: 20, region: R.us }, ["fanout"]),
  );
  // writing a post is a home-region job; any region's servers can send it there
  for (const r of regions) edges.push(e("app" + r, "post"));
  edges.push(e("post", "st", "async"), e("st", "fw"), e("fw", "tcus"));
  return { nodes, edges };
};

// ------------------------------------------------------------------ payment
export const payment = (o: { regions?: string[]; dbCopies?: string[] } = {}) => {
  const regions = o.regions ?? ["us", "eu"];
  const nodes: any[] = [mk("u", "user", { users: 500000, reqPerUser: 0.003 })];
  const edges: any[] = [];
  for (const r of regions) {
    nodes.push(
      mk("lb" + r, "load_balancer", { instances: 2, capacity: 20000, region: R[r] }),
      mk("api" + r, "server", { capacity: 500, replicas: 5, autoscale: true, maxReplicas: 12, idempotencyKeys: true, circuitBreaker: true, region: R[r] }, ["charge"]),
      mk("lg" + r, "service", { capacity: 1000, replicas: 3, autoscale: true, maxReplicas: 8, region: R[r] }, ["ledger"]),
      mk("ps" + r, "service", { capacity: 1000, replicas: 3, autoscale: true, maxReplicas: 8, region: R[r] }, ["processor"]),
      mk("fs" + r, "service", { capacity: 1000, replicas: 3, autoscale: true, maxReplicas: 10, region: R[r] }, ["fraud"]),
      mk("q" + r, "queue", { capacity: 10000, region: R[r] }),
      mk("rcw" + r, "worker", { capacity: 200, replicas: 4, autoscale: true, maxReplicas: 12, idempotent: true, region: R[r] }, ["receipt"]),
    );
    edges.push(e("u", "lb" + r), e("lb" + r, "api" + r), e("api" + r, "lg" + r), e("lg" + r, "db"), e("api" + r, "ps" + r), e("ps" + r, "tp"), e("api" + r, "fs" + r), e("api" + r, "q" + r, "async"), e("q" + r, "rcw" + r), e("rcw" + r, "tp2"));
  }
  nodes.push(
    mk("db", "database", { capacity: 4000, shards: 2, readReplicas: regions.length > 1 ? 0 : 1, consistency: "Serializable", engine: "Relational", indexes: ["ledger_entries:idem_key", "ledger_entries:account_id"], shardKeys: ["ledger_entries:account_id"], region: R.us, replicaRegions: (o.dbCopies ?? regions.filter((x) => x !== "us")).map((x) => R[x]) }),
    mk("tp", "third_party", { capacity: 3500, kind: "Payment processor" }),
    mk("tp2", "third_party", { capacity: 3500, kind: "Email / SMS" }),
    mk("rc", "worker", { capacity: 200, replicas: 2, idempotent: true, region: regions.length > 1 ? R.eu : R.us }, ["reconcile"]),
  );
  edges.push(e("rc", "db"), e("rc", "tp"));
  return { nodes, edges };
};

if (process.argv[1]?.endsWith("try-regions.ts")) {
  const only = process.argv[2];
  if (!only || only === "us") {
    const P = us as unknown as Problem;
    show("one region only", P, urlShortener({ regions: ["us"], dbCopies: [] }));
    show("three regions, database copies", P, urlShortener());
    show("three regions, no database copies", P, urlShortener({ dbCopies: [] }));
  }
  if (!only || only === "nf") {
    const P = nf as unknown as Problem;
    show("one region only", P, newsFeed({ regions: ["us"], dbCopies: [] }));
    show("three regions, database copies", P, newsFeed());
    show("three regions, no database copies", P, newsFeed({ dbCopies: [] }));
  }
  if (!only || only === "pay") {
    const P = pay as unknown as Problem;
    show("one region only", P, payment({ regions: ["us"], dbCopies: [] }));
    show("two regions, ledger copy", P, payment());
    show("two regions, no ledger copy", P, payment({ dbCopies: [] }));
  }
}

// ------------------------------------------------------------------ the principles, checked directly
if (process.argv[1]?.endsWith("try-regions.ts") && process.argv[2] === "test") {
  let fails = 0;
  const check = (name: string, ok: boolean, extra = "") => {
    console.log((ok ? "PASS " : "FAIL ") + name + (extra ? "  " + extra : ""));
    if (!ok) fails++;
  };
  const U = us as unknown as Problem;
  const N = nf as unknown as Problem;
  const Y = pay as unknown as Problem;
  const scn = (P: Problem, d: any, id: string) => analyze(d, P).scenarios.find((x) => x.scenarioId === id)!;
  const lat = (P: Problem, d: any, id: string) => scn(P, d, id).latencyByRegion!;

  // distance costs time
  const one = lat(U, urlShortener({ regions: ["us"], dbCopies: [] }), "global");
  check("one region: users at home pay nothing extra", one.us < 45, `${Math.round(one.us)} ms`);
  check("one region: Europe pays the Atlantic (85 ms)", Math.abs(one.eu - one.us - 85) < 2, `${Math.round(one.eu - one.us)} ms extra`);
  check("one region: Asia pays the Pacific (160 ms)", Math.abs(one.ap - one.us - 160) < 2, `${Math.round(one.ap - one.us)} ms extra`);
  check("so a single region fails the worldwide scenario and says why", !scn(U, urlShortener({ regions: ["us"], dbCopies: [] }), "global").pass && scn(U, urlShortener({ regions: ["us"], dbCopies: [] }), "global").reasons.some((r) => /too far/.test(r)));

  // a copy of the front, a copy of the data
  check("stacks in every region plus database copies serve everyone locally", Object.values(lat(U, urlShortener(), "global")).every((v) => v < 45) && scn(U, urlShortener(), "global").pass);
  const noCopy = lat(U, urlShortener({ dbCopies: [] }), "global");
  check("stacks without database copies: cache misses still cross the ocean", noCopy.ap > 150 && noCopy.eu > 100, `eu ${Math.round(noCopy.eu)}, ap ${Math.round(noCopy.ap)}`);
  check("... but users at home are unaffected", noCopy.us < 45);
  const onlyEu = lat(U, urlShortener({ dbCopies: ["eu"] }), "global");
  check("a copy in Europe only helps Europe", onlyEu.eu < 45 && onlyEu.ap > 150);

  // the User block decides who goes where
  const d = urlShortener();
  d.edges = d.edges.filter((x: any) => !(x.source === "u" && x.target !== "lbus"));
  const viaUs = lat(U, d, "global");
  check("if users are only connected to the US, every call from elsewhere crosses the ocean first", viaUs.ap > 190 && viaUs.eu > 120, `eu ${Math.round(viaUs.eu)}, ap ${Math.round(viaUs.ap)}`);

  // writes
  check("writes to the home region are noted but not held against the target", scn(U, urlShortener(), "global").notes.some((n) => /Writes \(about \d+% of requests\) go to US East/.test(n)));
  check("a write-heavy store does count its distance (payment, 90% writes)", lat(Y, payment({ regions: ["us", "eu"] }), "region_down").eu < lat(Y, payment({ regions: ["us", "eu"] }), "region_down").us);

  // scenarios without a regionMix are untouched
  check("scenarios without a regionMix report no regional latency", scn(U, urlShortener({ regions: ["us"], dbCopies: [] }), "normal").latencyByRegion === undefined);

  // region outage
  const downOne = scn(Y, payment({ regions: ["us"], dbCopies: [] }), "region_down");
  check("one region only: when it goes down nothing is served", downOne.served === 0 && !downOne.pass);
  const downTwo = scn(Y, payment(), "region_down");
  check("two regions with a ledger copy: payments keep flowing and the ledger fails over", downTwo.pass && downTwo.served > 0.99 && downTwo.notes.some((n) => /failed over to its copy in Europe/.test(n)));
  check("the database ends up in the surviving region", downTwo.nodes["db"].region === "eu");
  const downNoCopy = scn(Y, payment({ dbCopies: [] }), "region_down");
  check("two regions but no ledger copy: the ledger is gone, so payments fail", !downNoCopy.pass && downNoCopy.served < 0.5);
  check("the advice says to add a region and a copy", downOne.advice.some((a) => /second region/.test(a.change)));
  check("a single region raises the single-region finding; two regions do not", analyze(payment({ regions: ["us"], dbCopies: [] }), Y).findings.some((f) => f.id === "single-region") && !analyze(payment(), Y).findings.some((f) => f.id === "single-region"));
  check("a background job in the lost region is reported as piling up", (() => { const x = payment(); (x.nodes.find((n: any) => n.id === "rc") as any).cfg.region = "US East"; return scn(Y, x, "region_down").notes.some((n) => /Reconcile/.test(n) && /piles up/.test(n)); })());

  // the news feed
  const nfOne = lat(N, newsFeed({ regions: ["us"], dbCopies: [] }), "global");
  check("news feed: one region leaves Europe and Asia slow", nfOne.eu > 120 && nfOne.ap > 150, `eu ${Math.round(nfOne.eu)}, ap ${Math.round(nfOne.ap)}`);
  check("news feed: regional stacks with database copies serve everyone", scn(N, newsFeed(), "global").pass);
  check("news feed: a ranking service that stays in the US is skipped by its 40 ms timeout elsewhere", (() => { const x = newsFeed(); for (const r of ["eu", "ap"]) { x.edges = x.edges.filter((e: any) => !(e.source === "app" + r && e.target === "rank" + r)).concat([{ id: "far" + r, source: "app" + r, target: "rankus", kind: "sync" }]); } return !scn(N, x, "global").pass; })());

  // nothing outside a regional scenario changes
  check("the normal scenarios give the same answer with or without regions", analyze(urlShortener({ regions: ["us"], dbCopies: [] }), U).scenarios.slice(0, 4).every((s) => s.pass));

  console.log(fails ? `\n${fails} FAILED` : "\nall passed");
  process.exit(fails ? 1 : 0);
}
