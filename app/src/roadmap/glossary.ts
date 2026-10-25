import type { GlossaryEntry } from "./types";

/**
 * Plain-language terms used in primers and the glossary tab.
 * `where` is the first roadmap problem that introduces the idea.
 * Inline text can mark a term with [[term]] or [[term|label]].
 */
export const GLOSSARY: GlossaryEntry[] = [
  {
    term: "requests per second",
    plain: "How many requests arrive each second. Often shortened to rps. It is the main way we talk about load.",
    where: "library_management",
    lesson: { lesson: "module-0", page: "m0-capacity-and-overload" },
  },
  {
    term: "rps",
    plain: "Short for requests per second — how many requests arrive each second.",
    where: "library_management",
    lesson: { lesson: "module-0", page: "m0-capacity-and-overload" },
  },
  {
    term: "capacity",
    plain: "How much work a block can handle before it slows down or starts failing. Measured in things like rps or operations per second.",
    where: "library_management",
    lesson: { lesson: "module-0", page: "m0-capacity-and-overload" },
  },
  {
    term: "replica",
    plain: "An extra copy of the same block. Replicas share the load and help if one copy dies.",
    where: "library_management",
    lesson: { lesson: "module-0", page: "m0-copies-and-balancer" },
  },
  {
    term: "instance",
    plain: 'One running copy of a block. "Three instances" means three machines or containers doing that job.',
    where: "library_management",
    lesson: { lesson: "module-0", page: "m0-copies-and-balancer" },
  },
  {
    term: "load balancer",
    plain: "A block that spreads incoming requests across several servers so no single one takes everything.",
    where: "library_management",
    lesson: { lesson: "module-0", page: "m0-copies-and-balancer" },
  },
  {
    term: "server",
    plain: "A block that runs your application code and answers requests. You can run several and put a load balancer in front.",
    where: "library_management",
    lesson: { lesson: "module-0", page: "m0-requests-and-blocks" },
  },
  {
    term: "cache",
    plain: "A fast store of recent answers. A hit means you avoid calling the slower database or API behind it.",
    where: "library_management",
    lesson: { lesson: "module-1", page: "m1-cache-hits-and-misses" },
  },
  {
    term: "hit ratio",
    plain: "The share of lookups that find an answer in the cache. Higher means fewer trips to the slow store.",
    where: "library_management",
    lesson: { lesson: "module-0", page: "m0-blob-and-cdn" },
  },
  {
    term: "lock",
    plain:
      "A rule that stops two writers from changing the same data at the same time. Stronger locks protect correctness but slow writes.",
    where: "library_management",
    lesson: { lesson: "module-1", page: "m1-two-writers-and-locks" },
  },
  {
    term: "CDN",
    plain:
      "A content delivery network: copies of files kept near readers around the world so downloads are fast and the origin stays quiet.",
    where: "pastebin",
    lesson: { lesson: "module-0", page: "m0-blob-and-cdn" },
  },
  {
    term: "queue",
    plain: "A waiting list of jobs. Workers pull jobs and process them. Good for bursts; does not keep a global order.",
    where: "url_shortener",
    lesson: { lesson: "module-2", page: "m2-queues-and-workers" },
  },
  {
    term: "stream",
    plain:
      "An ordered log of events that many readers can follow and replay. Use a partition key to spread load while keeping related events together.",
    where: "messaging_app",
    lesson: { lesson: "module-3", page: "m3-ordering-streams-replay" },
  },
  {
    term: "worker",
    plain: "A block that pulls jobs from a queue or stream and does slow or background work off the main request path.",
    where: "url_shortener",
    lesson: { lesson: "module-2", page: "m2-queues-and-workers" },
  },
  {
    term: "asynchronous",
    plain: "Do the slow part later. Accept the request now, put work on a queue, and let a worker finish it.",
    where: "notification",
    lesson: { lesson: "module-2", page: "m2-queues-and-workers" },
  },
  {
    term: "idempotent",
    plain: "Safe to retry. Doing the same request twice has the same effect as doing it once — no double send or double charge.",
    where: "notification",
    lesson: { lesson: "module-2", page: "m2-retries-and-idempotency" },
  },
  {
    term: "circuit breaker",
    plain: "Stops calling a failing dependency for a while so your own service stays up. Often paired with a timeout and a fallback.",
    where: "pastebin",
    lesson: { lesson: "module-2", page: "m2-optional-work-isolation" },
  },
  {
    term: "timeout",
    plain: "How long you wait for a call before giving up. Too short and you skip healthy work; too long and you hang.",
    where: "pastebin",
    lesson: { lesson: "module-2", page: "m2-providers-timeouts-limits" },
  },
  {
    term: "fallback",
    plain: "What you do when a dependency fails or the breaker is open — for example skip ads and still show the page.",
    where: "pastebin",
    lesson: { lesson: "module-2", page: "m2-providers-timeouts-limits" },
  },
  {
    term: "backlog",
    plain: "Jobs waiting in a queue or stream that workers have not finished yet. A growing backlog means you are falling behind.",
    where: "notification",
    lesson: { lesson: "module-2", page: "m2-backlog-and-drain" },
  },
  {
    term: "p99 latency",
    plain: "The delay that 99% of requests are faster than. It catches the slow tail that averages hide.",
    where: "library_management",
  },
  {
    term: "region",
    plain:
      "A geographic location where a block runs, such as US, Europe or Asia. Users far from a region wait longer, and a whole region can go down.",
    where: "maps",
    lesson: { lesson: "module-1", page: "m1-regions-and-distance" },
  },
  {
    term: "latency",
    plain: "How long one request takes from start to finish. Lower is better. A latency target is the most delay you will accept.",
    where: "library_management",
  },
  {
    term: "shard",
    plain: "A slice of the data on its own node. Sharding spreads load; a bad key can leave one shard too hot.",
    where: "maps",
    lesson: { lesson: "module-1", page: "m1-replicas-vs-shards" },
  },
  {
    term: "replica set vs shard",
    plain: "Replicas are copies of the same data for capacity and failover. Shards are different slices of the data. You often use both.",
    where: "maps",
    lesson: { lesson: "module-1", page: "m1-replicas-vs-shards" },
  },
  {
    term: "transaction",
    plain: "A group of writes that succeed or fail together. Ledgers and multi-step money moves usually need this.",
    where: "payment",
    lesson: { lesson: "module-3", page: "m3-transactions" },
  },
  {
    term: "partition key",
    plain: "The field that decides which stream partition (or shard) an event lands on. Same key keeps order for that group.",
    where: "messaging_app",
    lesson: { lesson: "module-3", page: "m3-partition-keys-and-skew" },
  },
  {
    term: "autoscaling",
    plain: "Adding or removing instances as load grows or shrinks, up to a maximum you set.",
    where: "notification",
  },
  {
    term: "rate limit",
    plain: "A cap on how many calls you may make (or accept) in a time window. Third-party providers almost always have one.",
    where: "notification",
    lesson: { lesson: "module-2", page: "m2-providers-timeouts-limits" },
  },
  {
    term: "third-party provider",
    plain: "Someone else's API — ads, payments, email, maps. You do not control its speed, price, or outages.",
    where: "pastebin",
    lesson: { lesson: "module-2", page: "m2-providers-timeouts-limits" },
  },
  {
    term: "shared fate",
    plain: "When two features run on the same block, a failure or slowdown in one takes the other down with it.",
    where: "pastebin",
    lesson: { lesson: "module-2", page: "m2-optional-work-isolation" },
  },
  {
    term: "fan-out",
    plain: "Turning one write into many updates (for example filling many users' feeds) so each read stays cheap.",
    where: "news_feed",
    lesson: { lesson: "module-3", page: "m3-feed-fanout" },
  },
  {
    term: "hot key",
    plain: "One popular lookup key that almost everyone hits. It can overload a single cache or shard node.",
    where: "search",
  },
];

/** Case-insensitive lookup; also matches when the marker is a prefix of the glossary term or vice versa. */
export function lookupTerm(marker: string): GlossaryEntry | undefined {
  const q = marker.trim().toLowerCase();
  if (!q) return undefined;
  const exact = GLOSSARY.find((g) => g.term.toLowerCase() === q);
  if (exact) return exact;
  return GLOSSARY.find((g) => g.term.toLowerCase().includes(q) || q.includes(g.term.toLowerCase()));
}
