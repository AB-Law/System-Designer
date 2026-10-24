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
      body: "Raise Replicas so several servers share the load, or turn on Autoscale so it grows with traffic. The badge turns green when it can keep up.",
      target: ".why",
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

export const TOURS: Record<string, Tour> = { [LIBRARY.problemId]: LIBRARY };
export const tourFor = (problemId: string): Tour | undefined => TOURS[problemId];

/** Index of the next step to show after `from`, passing over steps that do not apply. */
export function nextStep(tour: Tour, from: number, s: TourState): number {
  let i = from + 1;
  while (i < tour.steps.length && tour.steps[i].skip?.(s)) i++;
  return i;
}
