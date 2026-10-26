// A guided tour is a list of steps. A step is finished either by the learner doing the thing it asks (watched in the store, so there
// is no Next button to press) or, for explanations, by pressing Next. Add a tour for another problem by adding a script to TOURS.
import { planQueries } from "../sim/data";
import type { Problem, RunResult } from "../types";
import type { RFEdge, RFNode } from "../store/types";

/** What a step's condition can look at. */
export interface TourState {
  nodes: RFNode[];
  edges: RFEdge[];
  rightTab: string;
  /** block id of the selected block, if exactly one is selected */
  selectedBlock?: string;
  problem?: Problem;
  /** the simulator's result for the design as it is now */
  run?: RunResult;
}

export interface TourStep {
  id: string;
  title: string;
  body: string;
  /** CSS selector of what to point at (the page is left clickable underneath) */
  target?: string | ((s: TourState) => string | undefined);
  /** where the card sits relative to what it points at; by default wherever there is room */
  place?: "below" | "right";
  /** true when the learner has done what the step asks. Without it the step has a Next button. */
  done?: (s: TourState) => boolean;
  /** true when the step cannot apply (for example, nothing is red); it is skipped */
  skip?: (s: TourState) => boolean;
}

export interface Tour {
  problemId: string;
  title: string;
  /** one line for the offer shown before it starts */
  pitch: string;
  steps: TourStep[];
}

const has = (s: TourState, blockId: string) => s.nodes.some((n) => n.data.blockId === blockId);
const joined = (s: TourState, a: string, b: string) =>
  s.edges.some((e) => {
    const from = s.nodes.find((n) => n.id === e.source)?.data.blockId;
    const to = s.nodes.find((n) => n.id === e.target)?.data.blockId;
    return (from === a && to === b) || (from === b && to === a);
  });

/** The database's worst query, as how many times the work it needs (1 is as good as it gets). */
const worstQuery = (s: TourState): number => {
  const db = s.nodes.find((n) => n.data.blockId === "database");
  if (!db || !s.problem?.dataModel) return 1;
  const plan = planQueries(s.problem, db.data.cfg, s.problem.capabilities ?? []);
  return plan.queries.reduce((m, q) => Math.max(m, q.factor), 1);
};

const nodeOf = (blockId: string) => (s: TourState) => {
  const n = s.nodes.find((x) => x.data.blockId === blockId);
  return n ? `.react-flow__node[data-id="${n.id}"]` : undefined;
};
const dbNode = nodeOf("database");

/** The block is overloaded (or down) in the problem's first scenario. */
const hot = (s: TourState, blockId: string): boolean => {
  const n = s.nodes.find((x) => x.data.blockId === blockId);
  const r = n && s.run?.scenarios[0]?.nodes[n.id];
  return !!r && (r.down === true || (r.incoming > 0 && r.utilization >= 1));
};

const LIBRARY: Tour = {
  problemId: "library_management",
  title: "Your first design",
  pitch: "A 3-minute walk through building, running and fixing a design.",
  steps: [
    {
      id: "welcome",
      title: "Let's build a library system",
      body: "You will place a few blocks, connect them, run the simulator, and fix whatever it flags. Nothing here can break. You can leave any time with Skip.",
    },
    {
      id: "add-user",
      title: "1. Add the people using it",
      body: "Every design starts with traffic. Double-click User in the block list (or drag it onto the canvas). It already holds this problem's numbers: 60,000 members.",
      target: '[data-tour="palette-user"]',
      done: (s) => has(s, "user"),
    },
    {
      id: "add-server",
      title: "2. Add a Server",
      body: "A server runs your application code: searching the catalogue and checking books in and out. Add one the same way.",
      target: '[data-tour="palette-server"]',
      done: (s) => has(s, "server"),
    },
    {
      id: "link-user-server",
      title: "3. Connect them",
      body: "Hover a block to see its dots on the edges. Drag from a dot on User to a dot on the Server. That line is a request travelling between them.",
      target: nodeOf("user"),
      place: "below",
      done: (s) => joined(s, "user", "server"),
    },
    {
      id: "add-db",
      title: "4. Add a Database",
      body: "Books and loans have to be stored somewhere. Add a Database.",
      target: '[data-tour="palette-database"]',
      done: (s) => has(s, "database"),
    },
    {
      id: "link-server-db",
      title: "5. Connect the Server to the Database",
      body: "Now the server can read and write. Drag from the Server to the Database.",
      target: nodeOf("server"),
      place: "below",
      done: (s) => joined(s, "server", "database"),
    },
    {
      id: "simulate",
      title: "6. See how it does",
      body: "Open the Simulate tab. The app sends this problem's traffic through your design and checks each test scenario.",
      target: '[data-tour="tab-simulate"]',
      done: (s) => s.rightTab === "simulate",
    },
    {
      id: "open-db",
      title: "7. Something is red",
      body: "A block is struggling: its badge is red. Click the Database to find out why.",
      target: dbNode,
      done: (s) => s.selectedBlock === "database",
      skip: (s) => worstQuery(s) < 5,
    },
    {
      id: "why",
      title: "8. Read the reason",
      body: "This panel says what is wrong in plain words and what to try. Here the database reads every row of a table to answer each question, because it has no index.",
      target: ".why",
      skip: (s) => worstQuery(s) < 5,
    },
    {
      id: "fix",
      title: "9. Add the indexes",
      body: "Open Advanced: tune the queries. Add an index on Books by ISBN, and one on Loans by Member, then Due date. Order matters: filter first, sort second.",
      target: () => (document.querySelector(".dm-add") ? ".dm-add" : ".dm-toggle"),
      done: (s) => worstQuery(s) < 1.5,
      skip: (s) => worstQuery(s) < 5,
    },
    {
      id: "open-server",
      title: "10. Another red block",
      body: "The Server is red too: it is one machine facing 3,000 requests a second. Click it.",
      target: nodeOf("server"),
      done: (s) => s.selectedBlock === "server",
      skip: (s) => !hot(s, "server"),
    },
    {
      id: "scale",
      title: "11. Give it more copies",
      body: "Raise Replicas here so several servers share the load (or turn on Autoscale below it, so it grows with traffic). The badge turns green when it can keep up.",
      target: '[data-field="replicas"]',
      done: (s) => !hot(s, "server"),
      skip: (s) => !hot(s, "server"),
    },
    {
      id: "hosts",
      title: "12. Say what the Server runs",
      body: "Some requests still have nothing to handle them: a server only does the jobs ticked under What this block runs. Select the Server and tick Check out or return a book.",
      target: ".hosts",
      done: (s) => (s.run?.scenarios[0]?.served ?? 1) >= 0.97,
      skip: (s) => (s.run?.scenarios[0]?.served ?? 1) >= 0.97,
    },
    {
      id: "finish",
      title: "That is the loop",
      body: "Build, run, read what is red, fix, run again. Other scenarios (a rush of members, the database failing) may still fail: pick them in the Simulate tab, and the reasons say what to add. Submit when you are happy.",
    },
  ],
};

const cfgOf = (s: TourState, blockId: string) => s.nodes.find((n) => n.data.blockId === blockId)?.data.cfg;
const num = (v: unknown, d = 0) => (typeof v === "number" && !Number.isNaN(v) ? v : d);
/** The block is overloaded (or down) in any scenario, not just the first. */
const hotAnywhere = (s: TourState, blockId: string): boolean => {
  const n = s.nodes.find((x) => x.data.blockId === blockId);
  return (
    !!n &&
    !!s.run?.scenarios.some((sc) => {
      const r = sc.nodes[n.id];
      return !!r && (r.down === true || (r.incoming > 0 && r.utilization >= 1));
    })
  );
};
/** Requests a second the servers could still answer if one replica were lost. */
const withOneLost = (s: TourState): number => {
  const c = cfgOf(s, "server");
  return c ? Math.max(0, num(c.replicas, 1) - 1) * num(c.capacity, 1000) : 0;
};

const BLOG: Tour = {
  problemId: "personal_blog",
  title: "How to think about a small site",
  pitch: "Size the traffic first, then add only what the simulator says you need.",
  steps: [
    {
      id: "think-traffic",
      title: "First, count the traffic",
      body: "Before placing anything, work out the load. 5,000 readers, each making 0.02 requests a second, is about 100 requests a second on a normal day. When a news site shares a post that is 12 times more: about 1,200 a second. Design for the peak, not the quiet day.",
    },
    {
      id: "think-small",
      title: "Start with the smallest thing that could work",
      body: "A beginner's mistake is to add every block you know. Instead build the minimum, run it, and let the simulator tell you what is missing. Each block you add costs money every month.",
    },
    {
      id: "add-user",
      title: "1. Add the readers",
      body: "Double-click User in the block list (or drag it over). It already holds this blog's numbers.",
      target: '[data-tour="palette-user"]',
      done: (s) => has(s, "user"),
    },
    {
      id: "add-server",
      title: "2. Add a Server",
      body: "The server builds each page from the posts. Add one.",
      target: '[data-tour="palette-server"]',
      done: (s) => has(s, "server"),
    },
    {
      id: "add-db",
      title: "3. Add a Database",
      body: "The posts have to live somewhere. Add a Database.",
      target: '[data-tour="palette-database"]',
      done: (s) => has(s, "database"),
    },
    {
      id: "link",
      title: "4. Connect them in order",
      body: "Drag from a dot on User to the Server, then from the Server to the Database. A request travels along those lines.",
      target: nodeOf("user"),
      place: "below",
      done: (s) => joined(s, "user", "server") && joined(s, "server", "database"),
    },
    {
      id: "simulate",
      title: "5. Run it",
      body: "Open Simulate. Look at each scenario: one server copes on a normal day, but see what the shared-post scenario and 'A server fails' do to it.",
      target: '[data-tour="tab-simulate"]',
      done: (s) => s.rightTab === "simulate",
    },
    {
      id: "think-fix",
      title: "Read the red, then reason",
      body: "The spike is about 1,200 a second and one server handles about 1,000. And with a single server, losing it means the blog is gone. Two different problems, one fix: several identical servers, so the spike is shared and losing one still leaves the rest.",
    },
    {
      id: "scale",
      title: "6. Add copies",
      body: "Select the Server and raise Replicas. Rule of thumb: the copies left after losing one must still cover the peak.",
      target: '[data-field="replicas"]',
      done: (s) => withOneLost(s) >= 1200,
    },
    {
      id: "add-lb",
      title: "7. Add a Load Balancer",
      body: "Something has to hand each visitor to one of the copies. Add a Load Balancer between User and Server: remove the direct line by selecting it and pressing Delete, then connect User to the Load Balancer, and the Load Balancer to the Server.",
      target: '[data-tour="palette-load_balancer"]',
      done: (s) => joined(s, "user", "load_balancer") && joined(s, "load_balancer", "server"),
    },
    {
      id: "finish",
      title: "That is the way to think about it",
      body: "Count the peak, build the minimum, read what is red, add the one thing that fixes it. Check the cost at the top: three modest servers are cheaper than one huge one. Submit when the scenarios are green and you are under budget.",
    },
  ],
};

const PORTFOLIO: Tour = {
  problemId: "photo_portfolio",
  title: "How to think about files and cost",
  pitch: "Work out which requests are heavy, and answer them somewhere cheaper.",
  steps: [
    {
      id: "think-traffic",
      title: "First, ask what the requests are for",
      body: "50,000 visitors at 0.02 requests a second is about 1,000 a second normally, and 5 times that (5,000) when a gallery is featured. But look at the brief: 9 in 10 requests are for a photo file. Big files and small records are different jobs.",
    },
    {
      id: "think-store",
      title: "Where do files go?",
      body: "The originals are the only copies and must never be lost, so they belong in storage built for files, not in the database. Records (titles, captions) go in the database.",
    },
    {
      id: "add-user",
      title: "1. Add the visitors",
      body: "Add User from the block list.",
      target: '[data-tour="palette-user"]',
      done: (s) => has(s, "user"),
    },
    {
      id: "add-server",
      title: "2. Add a Server",
      body: "Add a Server to put pages together.",
      target: '[data-tour="palette-server"]',
      done: (s) => has(s, "server"),
    },
    {
      id: "add-db",
      title: "3. Add a Database",
      body: "For the small records.",
      target: '[data-tour="palette-database"]',
      done: (s) => has(s, "database"),
    },
    {
      id: "add-blob",
      title: "4. Add Blob Storage",
      body: "For the original photos. Blob means a big chunk of file data.",
      target: '[data-tour="palette-blob_storage"]',
      done: (s) => has(s, "blob_storage"),
    },
    {
      id: "link",
      title: "5. Connect them",
      body: "User to Server, then the Server to both the Database and Blob Storage.",
      target: nodeOf("user"),
      place: "below",
      done: (s) => joined(s, "user", "server") && joined(s, "server", "database") && joined(s, "server", "blob_storage"),
    },
    {
      id: "simulate",
      title: "6. Run it",
      body: "Open Simulate and try the featured scenario. Work out which blocks go red and notice that the same few photos are asked for over and over.",
      target: '[data-tour="tab-simulate"]',
      done: (s) => s.rightTab === "simulate",
    },
    {
      id: "think-cdn",
      title: "Do not buy bigger servers: answer the repeats elsewhere",
      body: "Sending the same photo from your server 5,000 times a second is waste. A CDN keeps copies close to visitors and answers most of the surge itself. Your servers and storage only see what gets through.",
    },
    {
      id: "add-cdn",
      title: "7. Put a CDN in front",
      body: "Add a CDN and put it between User and Server: User to CDN, CDN to Server.",
      target: '[data-tour="palette-cdn"]',
      done: (s) => joined(s, "user", "cdn") && (joined(s, "cdn", "server") || joined(s, "cdn", "load_balancer")),
    },
    {
      id: "static",
      title: "8. Tell it what it can keep",
      body: "Select the CDN and set Static share of traffic to 0.9, because 9 in 10 requests are photos. Its Hit Ratio (how often the copy is already there) is already 0.9.",
      target: '[data-field="staticShare"]',
      done: (s) => num(cfgOf(s, "cdn")?.staticShare) >= 0.85,
    },
    {
      id: "think-math",
      title: "Check the maths",
      body: "Share that gets through = 1 minus (0.9 hit x 0.9 static) = about 19%. So 5,000 a second at the front becomes about 950 a second at the Server. Size the Server for 950, not 5,000. That is why a CDN is cheaper than big servers.",
    },
    {
      id: "think-cost",
      title: "Watch the bill",
      body: "Select the Server and look at its Autoscaling. A big Max replicas is billed even when unused: you pay for the headroom you reserve. Keep it near what the 950 a second needs.",
      target: nodeOf("server"),
      place: "below",
    },
    {
      id: "finish",
      title: "That is the way to think about it",
      body: "Split heavy files from small records, answer repeats near the visitor, size each block for the traffic that actually reaches it. Submit when the scenarios are green and you are under the $2,200 budget.",
    },
  ],
};

const POLL: Tour = {
  problemId: "class_poll",
  title: "How to think about many writers",
  pitch: "When everyone writes at once, correctness matters as much as speed.",
  steps: [
    {
      id: "think-traffic",
      title: "First, read the shape of the load",
      body: "2,000 students at 0.1 requests a second is about 200 a second when idle, and 6 times that (1,200) when a question opens. And 70% of the requests are votes, which are writes. Writes are harder than reads because they change data.",
    },
    {
      id: "think-race",
      title: "What goes wrong when two vote at once?",
      body: "Voting means: read the tally, add one, write it back. If two students do this at the same instant, both read 41 and both write 42. One vote is lost. At this scale it is certain, not rare. This problem is about stopping that.",
    },
    {
      id: "add-user",
      title: "1. Add the students",
      body: "Add User from the block list.",
      target: '[data-tour="palette-user"]',
      done: (s) => has(s, "user"),
    },
    {
      id: "add-server",
      title: "2. Add a Server",
      body: "Add a Server to take the votes.",
      target: '[data-tour="palette-server"]',
      done: (s) => has(s, "server"),
    },
    {
      id: "add-db",
      title: "3. Add a Database",
      body: "The tally lives here. Add a Database.",
      target: '[data-tour="palette-database"]',
      done: (s) => has(s, "database"),
    },
    {
      id: "link",
      title: "4. Connect them",
      body: "User to Server, then Server to Database.",
      target: nodeOf("user"),
      place: "below",
      done: (s) => joined(s, "user", "server") && joined(s, "server", "database"),
    },
    {
      id: "open-db",
      title: "5. Open the Database settings",
      body: "Click the Database. Find Locking: it is how the database stops two writers overwriting each other.",
      target: nodeOf("database"),
      done: (s) => s.selectedBlock === "database",
    },
    {
      id: "lock",
      title: "6. Protect the tally",
      body: "Set Locking to Row locks. Each vote now waits its turn on the tally, so none are lost. Note the cost: waiting makes writes slower.",
      target: '[data-field="consistency"]',
      done: (s) => ["Row locks", "Serializable"].includes(String(cfgOf(s, "database")?.consistency)),
    },
    {
      id: "simulate",
      title: "7. Run it",
      body: "Open Simulate and try 'A question opens'. Protection has a price: the database may now be too slow for 1,200 votes a second.",
      target: '[data-tour="tab-simulate"]',
      done: (s) => s.rightTab === "simulate",
    },
    {
      id: "db-capacity",
      title: "8. Give the database room",
      body: "If the Database is red, raise its Capacity until it is not. Locking costs speed, so it needs more headroom than without it.",
      target: '[data-field="capacity"]',
      done: (s) => !!s.run && !hotAnywhere(s, "database"),
      skip: (s) => !!s.run && !hotAnywhere(s, "database"),
    },
    {
      id: "server-capacity",
      title: "9. Check the Server too",
      body: "If the Server is red in the opening scenario, add Replicas. Votes should not queue before they reach the database.",
      target: nodeOf("server"),
      done: (s) => !!s.run && !hotAnywhere(s, "server"),
      skip: (s) => !!s.run && !hotAnywhere(s, "server"),
    },
    {
      id: "finish",
      title: "That is the way to think about it",
      body: "When many people write at once, protect the shared value first, then pay for the capacity that protection costs. Note the limit: row locks keep every vote but do not make the poll scale to unlimited voters. Submit when it is green and under budget.",
    },
  ],
};

export const TOURS: Record<string, Tour> = {
  [LIBRARY.problemId]: LIBRARY,
  [BLOG.problemId]: BLOG,
  [PORTFOLIO.problemId]: PORTFOLIO,
  [POLL.problemId]: POLL,
};
export const tourFor = (problemId: string): Tour | undefined => TOURS[problemId];

/** Index of the next step to show after `from`, passing over steps that do not apply. */
export function nextStep(tour: Tour, from: number, s: TourState): number {
  let i = from + 1;
  while (i < tour.steps.length && tour.steps[i].skip?.(s)) i++;
  return i;
}
