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
        lessonPage: "m0-copies-and-balancer",
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
      {
        problemId: "photo_portfolio",
        lessonPage: "m0-blob-and-cdn",
        minutes: 25,
        youWillLearn: [
          "Why large files and small records need different homes",
          "What a [[CDN]] takes off the servers, and what it does not do",
          "How a [[hit ratio]] shows up in the load your servers see",
        ],
        newIdeas: ["Blob Storage", "CDN"],
        primer: [
          "Files are kept in blob storage. A CDN keeps copies of popular ones close to visitors.",
          "The edge only answers what it already has. The [[hit ratio]] decides how much goes on.",
          "A CDN has its own settings and its own cost. Look at both.",
        ],
        watchOutFor: "Treating the CDN as the place the photos live.",
        reflect: [
          "What share of a surge reached your servers?",
          "What would you still have if the CDN lost every copy?",
          "What did the CDN cost, and what did it save?",
        ],
      },
    ],
  },
  {
    id: "traffic-copies-correctness",
    title: "Traffic, copies and correctness",
    blurb: "Reads against writes, caches, copies against slices, and what stops two writers losing each other's work.",
    lesson: "module-1",
    wrapUp: {
      recap: [
        "Reads and writes behave differently, and the mix decides which side of a store is the limit.",
        "A cache's hit ratio is a number you hope for, and the share that misses is what the store carries.",
        "A replica is a copy of everything and helps reads and survival. A shard is a slice of the data and spreads writes. Replicas do not add write capacity.",
        "A lock stops two writers losing each other's update, at the price of making the second one wait.",
        "Anything that needs a number nobody else has needs an agreed way to make it, and each way has a cost.",
        "Distance adds delay. A copy of the data near the reader helps reads, and writes still go to the home region.",
      ],
      reflection:
        "Think of two people changing the same thing at once in an app you use. What do you think it does to stop one change being lost?",
    },
    steps: [
      {
        problemId: "class_poll",
        lessonPage: "m1-two-writers-and-locks",
        minutes: 25,
        youWillLearn: [
          "Why two writers at the same moment can lose an update",
          "What a [[lock]] protects, and what it costs",
          "Why a protected database needs more [[capacity]] than an unprotected one",
        ],
        newIdeas: ["Row locks", "Locking setting"],
        primer: [
          "Two votes landing on the same tally at the same moment can overwrite each other. A [[lock]] makes one wait.",
          "A lock protects one update from being lost. It does not make the poll able to take unlimited voters.",
          "Waiting has a price. Check what the protection did to your database's room.",
        ],
        watchOutFor: "Sizing the database for the quiet lesson, or leaving the protection off because the quiet lesson looks fine.",
        reflect: [
          "What did your design do when two votes arrived together?",
          "What did the protection cost you, and where did you see it?",
          "What would you say if someone asked it to handle a million voters?",
        ],
      },
    ],
  },
  {
    id: "work-later",
    title: "Work that happens later",
    blurb: "Accept now and finish later: queues, backlogs, retries that are safe to repeat, and outside services that fail.",
    lesson: "module-2",
    wrapUp: {
      recap: [
        "A queue lets a system accept work quickly and do it later. It holds work and moves the waiting to the back, but it does not make work disappear.",
        "The backlog grows whenever work arrives faster than it is finished, and wait times grow with it. A burst that ends can be absorbed. A rate that never falls below the drain rate cannot.",
        "A job may run more than once, so make it idempotent: repeating it must have no extra effect.",
        "An outside service has its own rate limit and speed. A timeout bounds how long you wait, but it does not prove the call failed, and a fallback is what you do instead.",
        "Decide which features are critical and which are optional. Keep optional work from sharing a fate with critical work, by separating it or calling it behind a circuit breaker.",
      ],
      reflection:
        "Think of a feature in an app you use that you could live without. What would you want the app to do when that feature broke?",
    },
    steps: [
      {
        problemId: "contact_form",
        lessonPage: "m2-queues-and-workers",
        minutes: 30,
        youWillLearn: [
          "Accepting work now and finishing it later with a [[queue]] and [[worker|workers]]",
          "Why a retry needs the work to be [[idempotent]]",
          "Keeping the form up when an outside [[third-party provider|provider]] is down",
        ],
        newIdeas: ["Queue", "Worker", "Third-party API", "async connection", "Hosts"],
        primer: [
          "Accept the message quickly, and do the slow part later from a list of waiting work.",
          "A queue moves the waiting to the back. It does not make the work go away, so the workers still have to keep up.",
          "A message can be tried more than once. Check what a repeat would do.",
        ],
        watchOutFor: "Letting the visitor wait for the email, or sending a message twice when a retry repeats it.",
        reflect: [
          "Where in your design does the visitor stop waiting?",
          "What happens to a message when the provider fails?",
          "How did you stop a retry sending it twice?",
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
          "Where a [[CDN]] helps with content that rarely changes",
          "Calling an outside provider",
          "What a [[circuit breaker]] is for",
          "Keeping an optional feature from hurting a required one",
        ],
        newIdeas: ["Third-party API", "circuit breaker", "background job (expiry)"],
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
    id: "data-and-queries",
    title: "Data and query shape",
    blurb:
      "How data is laid out, searched, ordered and kept correct: tables, indexes, slices, copies of work, ordered logs and live updates.",
    lesson: "module-3",
    wrapUp: {
      recap: [
        "A query is a question, and the shape of the data decides what it costs. Choose a data model and an engine for the questions you need to answer.",
        "A scan reads every row. An index jumps to the right rows, but every index makes every write dearer.",
        "A search index answers questions about words. It is a second copy of the data, and it can be a moment behind.",
        "A transaction makes changes happen together or not at all, and a stronger setting costs write speed.",
        "Cutting data into slices needs a good partition key. A bad key leaves one slice doing most of the work, and a question without the key asks every slice.",
        "Fan-out on write makes reads cheap and writes dear. Fan-out on read does the opposite, and very popular items break the first.",
        "A stream keeps events in order for each key and can be read again. A queue hands each job out once.",
        "A live connection pushes at once and uses memory for every open connection. A copy can be a moment behind.",
      ],
      reflection:
        "Pick a screen in an app you use that shows a list of things. What question do you think the app answers to build it, and what would make that slow?",
    },
    steps: [
      {
        problemId: "library_management",
        lessonPage: "m3-search-index-first-look",
        minutes: 30,
        youWillLearn: [
          "How a question becomes work for the database",
          "What an index makes quicker, and what it costs",
          "What a [[cache]] and a search index are for",
          "What a [[lock]] protects",
        ],
        newIdeas: ["Search Index", "indexes and their cost", "query plans"],
        primer: [
          "A system design is a map of who talks to whom. You place blocks and connect them.",
          "[[Capacity]] is how much work a block can handle before it slows down or fails.",
          "A [[load balancer]] spreads requests across several copies of the same block.",
          "A [[cache]] remembers recent answers so you do not hit the slow store every time.",
          "A [[lock]] stops two writers from changing the same row at the same moment.",
          "A query is a question, and an index makes some questions fast and every write dearer. A search index answers questions about words, as a second copy of the data.",
        ],
        watchOutFor: "Sending every search to the main database.",
        reflect: [
          "Where did traffic spend most of its time in your design?",
          "Which block would fail first if load tripled?",
          "What did the cache protect, and what still had to go to the database?",
        ],
      },
      {
        problemId: "google_drive",
        lessonPage: "m3-live-connections",
        minutes: 50,
        youWillLearn: [
          "Blob storage and a [[CDN]] for big files",
          "Protecting version writes",
          "Keeping notifications from slowing downloads",
        ],
        newIdeas: ["live connections", "request routing by type"],
        primer: [
          "Large files usually live in blob (object) storage, not in a normal database row.",
          "A [[CDN]] helps downloads; uploads and version writes need careful paths of their own.",
          "Different request types can take different routes so one kind of work does not starve another.",
          "Live notifications are useful, but they should not sit on the download critical path. A live connection stays open and uses memory for each viewer.",
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
        lessonPage: "m3-ordering-streams-replay",
        minutes: 55,
        youWillLearn: [
          "[[Queue]] vs [[Stream]]",
          "Keeping order per conversation",
          "[[Partition key|Partition keys]]",
          "Key-value storage",
        ],
        newIdeas: ["Stream", "WebSocket Server", "Database engine"],
        primer: [
          "A [[queue]] hands each job out once, and a finished job is gone. Order across the whole system is not the point.",
          "A [[stream]] is a log of events kept in order and for a while. Many readers can read it, and a reader can go back and read again. Order is kept for events with the same key.",
          "A [[partition key]] decides which part of a stream, or which slice of a database, a message goes to. A key that carries nearly all the traffic leaves one part doing the work.",
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
        lessonPage: "m3-ordering-streams-replay",
        minutes: 55,
        youWillLearn: ["A waiting line to protect a fragile step", "[[Lock|Locks]] and their cost", "Payment [[idempotent|idempotency]]"],
        newIdeas: ["Stream as a line", "Serializable vs Row locks"],
        primer: [
          "Seat booking is fragile: two people must not get the same seat.",
          "A waiting line can protect a scarce step so the database is not crushed by everyone at once. A stream keeps people in the order they arrived.",
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
        problemId: "metrics_monitoring",
        lessonPage: "m3-data-models",
        minutes: 60,
        youWillLearn: ["Constant writes", "Batching", "Time-series storage", "Replaying a log", "Separating expensive reads"],
        newIdeas: ["time-series DB", "batching", "stream replay"],
        primer: [
          "Metrics never stop: many small writes, all the time.",
          "Batching groups writes so storage sees fewer, larger calls.",
          "A time-series engine is built for values that arrive in time order, and for questions about a stretch of time.",
          "A [[stream]] keeps events for a while, so a reader can go back and read them again after a storage hiccup.",
          "Heavy dashboard queries should not fight the write path for the same resources.",
        ],
        watchOutFor: "Letting dashboard queries share fate with the write ingest path.",
        reflect: [
          "Where did batching help most?",
          "What storage engine fit continuous appends?",
          "How would you replay after a storage outage?",
        ],
      },
      {
        problemId: "news_feed",
        lessonPage: "m3-feed-fanout",
        minutes: 60,
        youWillLearn: [
          "Doing work when writing so reading is cheap ([[fan-out]])",
          "The celebrity problem",
          "Ranking behind a [[circuit breaker]]",
        ],
        newIdeas: ["fan-out on write", "celebrity handling", "ranking breaker"],
        primer: [
          "[[Fan-out]] means spreading one write into many places. Doing it on write makes reads cheap and writes dear. Doing it on read does the opposite.",
          "A celebrity with millions of followers breaks fan-out on write: one post becomes millions of copies.",
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
    ],
  },
  {
    id: "search-maps-media",
    title: "Search, maps and media",
    blurb: "Finding things by words and by place, and moving large files and video to many people.",
    lesson: "module-4",
    wrapUp: {
      recap: [
        "An inverted index keeps a list of items for each word, so a search reads a few lists, not every item. Adding an item means updating many lists.",
        "A geographic index groups places by area. A grid updates cheaply but crowds in dense areas, a tree answers queries well but costs more to update, and a quadtree sits between. Extra copies add query capacity, not update capacity.",
        "A large file is sent in pieces, so a failed transfer resumes from the missing pieces. The size of a piece is a trade-off.",
        "Adaptive video is prepared in several qualities and cut into short segments. The player picks the quality it can keep up with, and the preparation is heavy background work.",
        "A crawler skips pages it has seen, keeps a list of addresses to fetch, and limits its speed per site. One limit across all sites is not polite.",
      ],
      reflection:
        "Think of an app that finds things near you or finds words in a lot of text. What do you think it keeps ready in advance to answer quickly?",
    },
    steps: [
      {
        problemId: "search",
        lessonPage: "m4-inverted-indexes",
        minutes: 60,
        youWillLearn: ["Speed at memory level", "[[Hot key|Hot keys]]", "Why [[replica|replicas]] on a cache matter"],
        newIdeas: ["prefix cache", "hot-key replicas"],
        primer: [
          "Autocomplete must feel instant. Memory-speed caches matter more than disk.",
          "A [[hot key]] is one popular lookup that everyone hits. One cache node can melt.",
          "[[Replica|Replicas]] of a cache spread that heat across copies.",
          "Personalisation is nice; core suggestions should still work if it hangs.",
          "A search index keeps a list of items for each word, so a search reads a few short lists instead of every item.",
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
        lessonPage: "m4-geographic-indexes",
        minutes: 60,
        youWillLearn: ["Geographic indexes", "Splitting by area ([[shard|sharding]])", "Dense cities"],
        newIdeas: ["Geo Index", "area shards"],
        primer: [
          '"Near me" needs a geographic index, not a plain list of places.',
          "Different index structures trade update cost against query quality. Extra copies add capacity for questions, not for updates.",
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
        lessonPage: "m4-streaming-and-adaptive-video",
        minutes: 60,
        youWillLearn: ["A [[CDN]] doing most of the work", "Heavy background conversion", "Request classes that must not interfere"],
        newIdeas: ["transcoding jobs", "request class isolation"],
        primer: [
          "Viewers mostly hit a [[CDN]]. Origin servers should stay quiet for normal play.",
          "Uploads need heavy conversion (transcoding). That is background work, not the play path.",
          "Video is cut into short segments in several qualities, and the player picks the quality it can keep up with. Large files move in pieces.",
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
        lessonPage: "m4-crawling-and-host-limits",
        minutes: 60,
        youWillLearn: ["Skipping duplicates early", "Being polite", "A plan limit you cannot exceed"],
        newIdeas: ["seen-url store", "politeness / rate limits"],
        primer: [
          "Crawlers revisit the web. Remembering what you already saw avoids wasted work. That memory is a cache, and the app caps how well it can work.",
          "Being polite means not hammering one site: respect [[rate limit|rate limits]] per host. One limit across the whole crawler does not protect any single site.",
          "The app has one global rate limiter and no limit for each site, so the per-site part of your design is judged by what you write.",
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
    ],
  },
  {
    id: "real-time-money",
    title: "Real-time decisions and money",
    blurb: "Matching, failing over across regions, and getting money right under tight limits.",
    lesson: "module-5",
    wrapUp: {
      recap: [
        "A second region helps only if it has servers and a copy of the data, and is sized to carry everything. A copy can be a moment behind, so a sudden failure can lose the latest changes.",
        "To match people to things nearby, find them with a geographic index and claim each one with a lock on that one thing. A lock makes the result correct. It does not create supply.",
        "A key sent with every retry lets a payment be carried out once. A ledger adds lines in pairs that sum to nothing, written together or not at all.",
        "Reconciliation compares your books with the provider's by id, sorts the differences, and sets timing aside. Real differences go to a person. It runs in the background.",
        "Waiting time is the sum of the steps before the answer. Background work, time limits and leaving things out take steps off the path, and each choice spends money.",
      ],
      reflection:
        "Think of a time a payment or booking seemed to go through twice. What do you think the app could have kept to tell the second try from the first?",
    },
    steps: [
      {
        problemId: "food_delivery",
        lessonPage: "m5-live-matching",
        minutes: 70,
        youWillLearn: ["Three different workloads in one product", "Stock [[lock|locks]]", "Optional vs essential"],
        newIdeas: ["multi-workload product", "stock locks"],
        primer: [
          "Ordering, tracking, and restaurant messaging are different workloads with different failure costs.",
          "Stock and assignment need [[lock|locks]] so two couriers do not get the same order. Lock the thing being claimed, such as the last portion of a dish, not the whole system.",
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
        lessonPage: "m5-live-matching",
        minutes: 70,
        youWillLearn: ["Index structures and their trade-offs", "A [[lock]] per driver", "Hot areas"],
        newIdeas: ["driver geo index", "per-driver locks"],
        primer: [
          "Matching riders to nearby drivers needs a live location index.",
          "Index structures trade update speed against query quality — same idea as nearby places, hotter data.",
          "A [[lock]] per driver stops two riders claiming the same car. A lock makes the result correct, but it cannot create drivers.",
          "Concerts create hot areas: shards and capacity must handle a spike in one place. Splitting a busy area into smaller ones spreads the work.",
          "The app checks that matching is protected by exclusive access. Whether you lock each driver or the whole city is judged by what you write.",
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
        lessonPage: "m5-payment-retries-and-ledgers",
        minutes: 70,
        youWillLearn: ["[[Idempotent|Idempotency]]", "Serializable ledgers", "A rate-limited essential provider", "Reconciliation"],
        newIdeas: ["ledger transactions", "reconciliation job"],
        primer: [
          "Money moves must be [[idempotent]]: a key sent with every retry lets a payment be carried out once. They also need real [[transaction|transactions]].",
          "A ledger only adds lines, in pairs that sum to nothing. It usually wants Serializable isolation so balances stay correct.",
          "The payment processor is essential and [[rate limit|rate-limited]]. Fraud checks may be optional.",
          "Reconciliation is background work that compares your books with the provider's by id, and sets timing differences aside.",
          "If a whole [[region]] is lost, a second region needs servers and a copy of the data, and must be sized to carry everything.",
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
        lessonPage: "m5-latency-and-cost-budgets",
        minutes: 80,
        youWillLearn: ["Caches, ranking behind a breaker, asynchronous events, autoscaling, and a tight budget — together"],
        newIdeas: ["capstone: combine prior patterns"],
        primer: [
          "This is the capstone: you already met the pieces; now they must fit under a tight budget.",
          "Campaign data wants a [[cache]]; ranking is valuable but can hang — use a [[circuit breaker]].",
          "Events (impressions, clicks) should be [[asynchronous]] so serving ads stays fast.",
          "[[Autoscaling]] helps spikes; cost still has a ceiling.",
          "Waiting time is the sum of the steps before the answer. Background work and time limits take steps off the path, and each choice spends money.",
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
