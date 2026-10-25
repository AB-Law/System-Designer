import type { RoadmapStage } from "./types";

/**
 * Curated beginner path through all practice problems.
 * Edit steps here; keep every problem id exactly once.
 * Primers must stay spoiler-free (no worked answers).
 */
export const ROADMAP: RoadmapStage[] = [
  {
    id: "first-designs",
    title: "First designs",
    blurb: "Meet the first blocks: a server, a database, copies of a server, and what happens when traffic outgrows one.",
    lesson: "module-0",
    wrapUp: {
      recap: [
        "A request passes through blocks, and each block does one job and has a limit.",
        "When work arrives faster than a block's capacity, some of it is not served.",
        "Several copies behind a load balancer share the work and survive one failing, but they cost money.",
        "Records and files need different homes: search and change records in a database, keep large files in blob storage.",
        "A CDN takes read load off the origin, but it is not where files are kept.",
      ],
      reflection:
        "Pick a website you use often. If ten times as many people arrived tomorrow, which of its blocks would you worry about first?",
    },
    steps: [
      {
        problemId: "personal_blog",
        minutes: 20,
        youWillLearn: [
          "Following one request from a visitor to the database and back",
          "What happens when traffic outgrows one [[server]]",
          "What a [[load balancer]] and extra [[replica|replicas]] change, and what they cost",
        ],
        newIdeas: ["User", "Server", "Database", "Load Balancer", "replicas"],
        primer: [
          "A visitor asks a [[server]], and the server reads the posts from a database.",
          "[[Capacity]] is how many [[requests per second|requests a second]] a block can answer. Past it, work is not served.",
          "Copies share load, and the budget is part of the question.",
        ],
        watchOutFor: "Sizing everything for a quiet day, or for the busiest hour of the year.",
        reflect: [
          "Which block filled up first when the post was shared?",
          "What did your design do when a server failed?",
          "What did the extra capacity cost, and was it worth it?",
        ],
      },
    ],
  },
  {
    id: "first-systems",
    title: "Your first systems",
    blurb: "Learn the vocabulary: capacity, copies, caches, and why order of blocks matters.",
    steps: [
      {
        problemId: "library_management",
        minutes: 30,
        youWillLearn: [
          "What a [[requests per second|request per second]] is",
          "Why one [[server]] is often not enough",
          "What a [[cache]] and a search index are for",
          "What a [[lock]] protects",
        ],
        newIdeas: ["User", "Load Balancer", "Server", "Cache", "Search Index", "Database", "replicas", "Row locks"],
        primer: [
          "A system design is a map of who talks to whom. You place blocks and connect them.",
          "[[Capacity]] is how much work a block can handle before it slows down or fails.",
          "A [[load balancer]] spreads requests across several copies of the same block.",
          "A [[cache]] remembers recent answers so you do not hit the slow store every time.",
          "A [[lock]] stops two writers from changing the same row at the same moment.",
        ],
        watchOutFor: "Sending every search to the main database.",
        reflect: [
          "Where did traffic spend most of its time in your design?",
          "Which block would fail first if load tripled?",
          "What did the cache protect, and what still had to go to the database?",
        ],
      },
      {
        problemId: "url_shortener",
        minutes: 40,
        youWillLearn: [
          "Reads often far outnumber writes",
          "Caching hot items",
          "What a [[queue]] and a [[worker]] are",
          "Why ids must never repeat",
        ],
        newIdeas: ["Queue", "Worker", "ID strategy"],
        primer: [
          "Many products are mostly reads: people open links far more than they create them.",
          "A [[cache]] is a good home for popular short links.",
          "A [[queue]] holds work for later; a [[worker]] pulls that work and does it.",
          "Creating a short code needs unique ids. The app has an ID strategy setting for that.",
        ],
        watchOutFor: "Counting clicks inside the redirect path itself.",
        reflect: [
          "How did you keep creating links from slowing down opening them?",
          "What work did you push off the hot path?",
          "How did you make sure two creates never share an id?",
        ],
      },
      {
        problemId: "pastebin",
        minutes: 45,
        youWillLearn: [
          "What a [[CDN]] does",
          "Calling an outside provider",
          "What a [[circuit breaker]] is for",
          "Keeping an optional feature from hurting a required one",
        ],
        newIdeas: ["CDN", "Third-party API", "circuit breaker", "background job (expiry)"],
        primer: [
          "A [[CDN]] serves static content from places near the reader.",
          "A third-party provider is someone else's service (ads, email, maps). You do not control its speed.",
          "A [[circuit breaker]] stops calling a failing friend so your own service stays up.",
          "Background jobs do slow cleanup later, off the request path.",
          "Optional work should not share fate with essential work when it can be avoided.",
        ],
        watchOutFor: "Letting the ad lookup sit on the read path.",
        reflect: [
          "What still worked when the ad network failed?",
          "Where did you put expiry work, and why?",
          "How did the circuit breaker change failure behaviour?",
        ],
      },
      {
        problemId: "notification",
        minutes: 45,
        youWillLearn: [
          "Doing slow work later ([[asynchronous]])",
          "[[Idempotent|Idempotency]] (safe to retry)",
          "Provider [[rate limit|rate limits]]",
          "[[Autoscaling]]",
        ],
        newIdeas: ["autoscaling", "idempotent workers", "queue buffering a burst"],
        primer: [
          "Sending email or SMS is slow. Accept the request fast, then send in the background.",
          "[[Idempotent]] means a retry does not send the same message twice.",
          "Providers cap how many calls you may make. That is a [[rate limit]].",
          "[[Autoscaling]] adds or removes worker copies as the backlog grows or shrinks.",
          "A [[queue]] can absorb a short burst so senders do not all fail at once.",
        ],
        watchOutFor: "A worker that can send the same notification twice.",
        reflect: [
          "What happened to the backlog when traffic spiked?",
          "How did you make retries safe?",
          "Which limit bit first: your workers or the provider?",
        ],
      },
    ],
  },
  {
    id: "patterns",
    title: "Patterns that appear everywhere",
    blurb: "Recognise the same few shapes in different clothes.",
    steps: [
      {
        problemId: "google_drive",
        minutes: 50,
        youWillLearn: [
          "Blob storage and a [[CDN]] for big files",
          "Protecting version writes",
          "Keeping notifications from slowing downloads",
        ],
        newIdeas: ["Blob Storage", "request routing by type"],
        primer: [
          "Large files usually live in blob (object) storage, not in a normal database row.",
          "A [[CDN]] helps downloads; uploads and version writes need careful paths of their own.",
          "Different request types can take different routes so one kind of work does not starve another.",
          "Live notifications are useful, but they should not sit on the download critical path.",
        ],
        watchOutFor: "Letting live notifications slow or block file downloads.",
        reflect: [
          "How did upload and download paths differ in your design?",
          "What protected concurrent version writes?",
          "Where did notifications live relative to the hot path?",
        ],
      },
      {
        problemId: "messaging_app",
        minutes: 55,
        youWillLearn: [
          "[[Queue]] vs [[Stream]]",
          "Keeping order per conversation",
          "[[Partition key|Partition keys]]",
          "Key-value storage",
        ],
        newIdeas: ["Stream", "WebSocket Server", "Database engine"],
        primer: [
          "A [[queue]] is for competing workers: any worker can take the next job. Order across the whole system is not the point.",
          "A [[stream]] keeps an ordered log. Readers can replay. A [[partition key]] decides which shard a message lands on.",
          "Chat often needs order per conversation, not one global order for the world.",
          "WebSocket servers hold live connections; storage still needs a careful choice of engine.",
        ],
        watchOutFor: "Using a plain queue when conversation order matters.",
        reflect: [
          "Where did you need order, and how did you get it?",
          "What did your partition key group together?",
          "What storage engine fit message metadata vs live delivery?",
        ],
      },
      {
        problemId: "ticket_booking",
        minutes: 55,
        youWillLearn: ["A waiting line to protect a fragile step", "[[Lock|Locks]] and their cost", "Payment [[idempotent|idempotency]]"],
        newIdeas: ["Stream as a line", "Serializable vs Row locks"],
        primer: [
          "Seat booking is fragile: two people must not get the same seat.",
          "A waiting line can protect a scarce step so the database is not crushed by everyone at once.",
          "Stronger [[lock|locks]] prevent bad writes but cut write throughput and add delay.",
          "Payments must be [[idempotent]]: a double-click must not charge twice.",
        ],
        watchOutFor: "Holding a seat lock while waiting on a slow payment call.",
        reflect: [
          "What did the waiting line protect?",
          "Which lock level did you choose, and what did it cost?",
          "How did you make payment retries safe?",
        ],
      },
      {
        problemId: "news_feed",
        minutes: 60,
        youWillLearn: [
          "Doing work when writing so reading is cheap ([[fan-out]])",
          "The celebrity problem",
          "Ranking behind a [[circuit breaker]]",
        ],
        newIdeas: ["fan-out on write", "celebrity handling", "ranking breaker"],
        primer: [
          "[[Fan-out]] means spreading one write into many places so each reader finds a ready feed.",
          "A celebrity with millions of followers breaks naive fan-out: one post becomes millions of writes.",
          "Ranking can be slow or fail. Put it behind a [[circuit breaker]] so a feed still loads.",
          "Cheap reads often mean you paid the cost earlier, at write time.",
        ],
        watchOutFor: "Fan-out that treats every account like a celebrity — or every celebrity like a normal account.",
        reflect: [
          "When did you pay the fan-out cost: on write or on read?",
          "How did a celebrity post behave differently?",
          "What happened when ranking slowed down?",
        ],
      },
      {
        problemId: "metrics_monitoring",
        minutes: 60,
        youWillLearn: ["Constant writes", "Batching", "Time-series storage", "Replaying a log", "Separating expensive reads"],
        newIdeas: ["time-series DB", "batching", "stream replay"],
        primer: [
          "Metrics never stop: many small writes, all the time.",
          "Batching groups writes so storage sees fewer, larger calls.",
          "Time-series stores are built for appends and time-range queries.",
          "A [[stream]] you can replay helps recover after a storage hiccup.",
          "Heavy dashboard queries should not fight the write path for the same resources.",
        ],
        watchOutFor: "Letting dashboard queries share fate with the write ingest path.",
        reflect: [
          "Where did batching help most?",
          "What storage engine fit continuous appends?",
          "How would you replay after a storage outage?",
        ],
      },
    ],
  },
  {
    id: "real-world",
    title: "Real-world and hard",
    blurb: "Put everything together under tighter limits.",
    steps: [
      {
        problemId: "search",
        minutes: 60,
        youWillLearn: ["Speed at memory level", "[[Hot key|Hot keys]]", "Why [[replica|replicas]] on a cache matter"],
        newIdeas: ["prefix cache", "hot-key replicas"],
        primer: [
          "Autocomplete must feel instant. Memory-speed caches matter more than disk.",
          "A [[hot key]] is one popular lookup that everyone hits. One cache node can melt.",
          "[[Replica|Replicas]] of a cache spread that heat across copies.",
          "Personalisation is nice; core suggestions should still work if it hangs.",
        ],
        watchOutFor: "One cache key that carries almost all of the traffic.",
        reflect: [
          "Which keys were hottest in your mental model?",
          "How did replicas change failure and capacity?",
          "What still worked when personalisation hung?",
        ],
      },
      {
        problemId: "maps",
        minutes: 60,
        youWillLearn: ["Geographic indexes", "Splitting by area ([[shard|sharding]])", "Dense cities"],
        newIdeas: ["Geo Index", "area shards"],
        primer: [
          '"Near me" needs a geographic index, not a plain list of places.',
          "Different index structures trade update cost against query quality.",
          "[[Shard|Sharding]] by area spreads dense cities across nodes.",
          "Photos and extras should not block the nearby search itself.",
        ],
        watchOutFor: "One shard that owns an entire dense city centre.",
        reflect: [
          "Which geo structure did you pick, and why?",
          "How did area shards help lunchtime load?",
          "What stayed up when photo storage slowed?",
        ],
      },
      {
        problemId: "video_streaming",
        minutes: 60,
        youWillLearn: ["A [[CDN]] doing most of the work", "Heavy background conversion", "Request classes that must not interfere"],
        newIdeas: ["transcoding jobs", "request class isolation"],
        primer: [
          "Viewers mostly hit a [[CDN]]. Origin servers should stay quiet for normal play.",
          "Uploads need heavy conversion (transcoding). That is background work, not the play path.",
          "Recommendations and play traffic should not share fate when one hangs.",
          "A premiere is a traffic spike: plan capacity and caching for the hot title.",
        ],
        watchOutFor: "Letting upload conversion or recommendations sit on the play path.",
        reflect: [
          "What percentage of play traffic should the CDN absorb?",
          "Where did transcoding run?",
          "How did you isolate request classes?",
        ],
      },
      {
        problemId: "web_crawler",
        minutes: 60,
        youWillLearn: ["Skipping duplicates early", "Being polite", "A plan limit you cannot exceed"],
        newIdeas: ["seen-url store", "politeness / rate limits"],
        primer: [
          "Crawlers revisit the web. Remembering what you already saw avoids wasted work.",
          "Being polite means not hammering one site: respect [[rate limit|rate limits]] per host.",
          'Budgets and ceilings in this app stop "infinite machines" from winning.',
          "Seen-address memory can be lost; think about recovery.",
        ],
        watchOutFor: "Discovering the same URL again and again with no early skip.",
        reflect: [
          "Where did you drop duplicates?",
          "How did you stay polite to a single host?",
          "What happened when seen-address memory was lost?",
        ],
      },
      {
        problemId: "food_delivery",
        minutes: 70,
        youWillLearn: ["Three different workloads in one product", "Stock [[lock|locks]]", "Optional vs essential"],
        newIdeas: ["multi-workload product", "stock locks"],
        primer: [
          "Ordering, tracking, and restaurant messaging are different workloads with different failure costs.",
          "Stock and assignment need [[lock|locks]] so two couriers do not get the same order.",
          "Optional features (live tracking polish) must not take down placing an order.",
          "Dinner rush is a spike: queues and autoscaling matter.",
        ],
        watchOutFor: "Letting courier tracking hang the order path.",
        reflect: [
          "Which three workloads did you separate?",
          "What did stock locks protect?",
          "What remained essential when messaging failed?",
        ],
      },
      {
        problemId: "ride_sharing",
        minutes: 70,
        youWillLearn: ["Index structures and their trade-offs", "A [[lock]] per driver", "Hot areas"],
        newIdeas: ["driver geo index", "per-driver locks"],
        primer: [
          "Matching riders to nearby drivers needs a live location index.",
          "Index structures trade update speed against query quality — same idea as nearby places, hotter data.",
          "A [[lock]] per driver stops two riders claiming the same car.",
          "Concerts create hot areas: shards and capacity must handle a spike in one place.",
        ],
        watchOutFor: "One global lock or one hot geo shard for the whole city.",
        reflect: [
          "What trade-off did your index structure make?",
          "How did per-driver locks behave under rush?",
          "What happened when maps provider failed?",
        ],
      },
      {
        problemId: "payment",
        minutes: 70,
        youWillLearn: ["[[Idempotent|Idempotency]]", "Serializable ledgers", "A rate-limited essential provider", "Reconciliation"],
        newIdeas: ["ledger transactions", "reconciliation job"],
        primer: [
          "Money moves must be [[idempotent]] and often need real [[transaction|transactions]].",
          "A ledger usually wants Serializable isolation so balances stay correct.",
          "The payment processor is essential and [[rate limit|rate-limited]]. Fraud checks may be optional.",
          "Reconciliation is background work that checks your books against the provider.",
        ],
        watchOutFor: "Blocking a payment on a slow optional fraud call with no breaker.",
        reflect: [
          "How did you make retries safe?",
          "Why did the ledger need strong isolation?",
          "What still worked when fraud scoring hung?",
        ],
      },
      {
        problemId: "ad_serving",
        minutes: 80,
        youWillLearn: ["Caches, ranking behind a breaker, asynchronous events, autoscaling, and a tight budget — together"],
        newIdeas: ["capstone: combine prior patterns"],
        primer: [
          "This is the capstone: you already met the pieces; now they must fit under a tight budget.",
          "Campaign data wants a [[cache]]; ranking is valuable but can hang — use a [[circuit breaker]].",
          "Events (impressions, clicks) should be [[asynchronous]] so serving ads stays fast.",
          "[[Autoscaling]] helps spikes; cost still has a ceiling.",
          "[[Shared fate]] between optional ranking and essential ad serve is the classic trap.",
        ],
        watchOutFor: "Letting ranking or the event pipeline sit on the critical ad-serve path.",
        reflect: [
          "Which earlier patterns showed up again here?",
          "What did you cut to stay in budget?",
          "What failed first under the ranking-slow scenario, and why?",
        ],
      },
    ],
  },
];

/** Flat list of steps in path order. */
export function allSteps(): { stage: RoadmapStage; step: RoadmapStage["steps"][0]; index: number }[] {
  const out: { stage: RoadmapStage; step: RoadmapStage["steps"][0]; index: number }[] = [];
  let i = 0;
  for (const stage of ROADMAP) {
    for (const step of stage.steps) {
      i += 1;
      out.push({ stage, step, index: i });
    }
  }
  return out;
}

export function findStep(problemId: string) {
  return allSteps().find((s) => s.step.problemId === problemId);
}

export const TOTAL_STEPS = allSteps().length;
