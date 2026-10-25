import { analyze } from "../../sim/analyze";
import type { Design } from "../../types";
import { edge, node, problem, scenario } from "./analyzeModels";

/*
  Module 4 demo models. The geographic one uses the app's own `analyze` with the Geo Index block, so its limits are the ones the canvas
  would show. The word index, the file pieces and the polite crawl are small teaching models: deterministic functions with invented
  numbers, none of which is produced by the app's simulator.
*/

// ----- geographic structures (bike stands) -----
export const STANDS = { rps: 9000, nodeCapacity: 4000, updateShare: 0.02 };
export const GEO_STRUCTURES = [
  { id: "Geohash grid", label: "Geohash grid" },
  { id: "Quadtree", label: "Quadtree" },
  { id: "R-tree", label: "R-tree" },
];

export interface GeoOutcome {
  /** the most questions and the most updates a second the index can answer */
  queryLimit: number;
  updateLimit: number;
  served: number;
  monthlyCost: number;
}

export function bikeStands(structure: string, shards: number, copies: number, updateShare: number = STANDS.updateShare): GeoOutcome {
  const design: Design = {
    nodes: [
      node("u", "user", { users: STANDS.rps, reqPerUser: 1 }),
      node("s", "server", { capacity: 50000, replicas: 1, autoscale: false }),
      node("g", "geo_index", { capacity: STANDS.nodeCapacity, structure, shards, replicas: copies }),
    ],
    edges: [edge("u", "s"), edge("s", "g")],
  };
  const p = problem("bike-stands", STANDS.rps, [scenario("now")]);
  p.traffic.writeShare = updateShare;
  const result = analyze(design, p);
  const s = result.scenarios[0];
  const g = s.nodes["g"];
  return {
    queryLimit: g.readCapacity ?? 0,
    updateLimit: g.writeCapacity ?? 0,
    served: s.served,
    monthlyCost: result.cost,
  };
}

// ----- a word index (recipe cards) -----
export const CARDS = {
  total: 10_000,
  wordsPerCard: 100,
  words: [
    { id: "lemon", label: "lemon", cards: 400 },
    { id: "thyme", label: "thyme", cards: 250 },
    { id: "salt", label: "salt", cards: 7000 },
  ],
};

export interface WordSearchOutcome {
  /** cards read when every card is checked */
  scanCards: number;
  /** entries read in the word lists */
  listEntries: number;
  /** cards that have all the chosen words, which is all the index has to open */
  matches: number;
  /** pieces of work to add one new card: one card, or the card and an entry in each of its word lists */
  addWithoutIndex: number;
  addWithIndex: number;
}

/** Cards that contain every chosen word, if the words fall on cards independently of each other. */
export function wordSearch(chosen: string[]): WordSearchOutcome {
  const picked = CARDS.words.filter((w) => chosen.includes(w.id));
  const listEntries = picked.reduce((a, w) => a + w.cards, 0);
  const matches = picked.length === 0 ? 0 : Math.round(picked.reduce((a, w) => a * (w.cards / CARDS.total), CARDS.total));
  return {
    scanCards: CARDS.total,
    listEntries,
    matches,
    addWithoutIndex: 1,
    addWithIndex: 1 + CARDS.wordsPerCard,
  };
}

// ----- a file in pieces (a wedding video) -----
export const FILE = { sizeMB: 2000, speedMBps: 10, failsAt: 0.9, perPieceSec: 0.1 };
export const PIECE_SIZES = [1, 10, 100, 500, 2000];

export interface UploadOutcome {
  pieces: number;
  /** megabytes sent in all, counting the part sent before the connection dropped */
  sentMB: number;
  seconds: number;
}

/** The connection drops at 90%. `resume`: the pieces that arrived are kept, so only the rest is sent. */
export function upload(pieceMB: number, resume: boolean): UploadOutcome {
  const { sizeMB, speedMBps, failsAt, perPieceSec } = FILE;
  const pieces = Math.ceil(sizeMB / pieceMB);
  const sentBefore = sizeMB * failsAt;
  const kept = resume ? Math.floor(sentBefore / pieceMB) * pieceMB : 0;
  const sentAfter = sizeMB - kept;
  const piecesSent = Math.ceil(sentBefore / pieceMB) + Math.ceil(sentAfter / pieceMB);
  const sentMB = sentBefore + sentAfter;
  return { pieces, sentMB, seconds: sentMB / speedMBps + piecesSent * perPieceSec };
}

// ----- a polite crawl (three sites) -----
export const CRAWL = {
  sites: [
    { id: "big", label: "The big site", addresses: 600 },
    { id: "mid", label: "A middle-sized site", addresses: 300 },
    { id: "small", label: "A small site", addresses: 100 },
  ],
  /** requests a second the whole crawler can make */
  globalPerSec: 20,
  /** requests a second a site copes with comfortably */
  comfortable: 5,
};

export type CrawlMode = "found" | "shuffled" | "perSite";

export interface CrawlOutcome {
  seconds: number;
  /** requests a second the busiest site receives at its worst */
  peakPerSite: number;
  coping: boolean;
}

/**
 * "found": one global speed, with addresses fetched in the order they were found, the big site's first.
 * "shuffled": one global speed, with addresses mixed up so each site gets its share.
 * "perSite": a limit of `perSite` requests a second on every site, within the global speed.
 */
export function crawl(mode: CrawlMode, perSite: number): CrawlOutcome {
  const total = CRAWL.sites.reduce((a, s) => a + s.addresses, 0);
  const biggest = Math.max(...CRAWL.sites.map((s) => s.addresses));
  let seconds: number;
  let peak: number;
  if (mode === "found") {
    seconds = total / CRAWL.globalPerSec;
    peak = CRAWL.globalPerSec;
  } else if (mode === "shuffled") {
    seconds = total / CRAWL.globalPerSec;
    peak = CRAWL.globalPerSec * (biggest / total);
  } else {
    seconds = Math.max(total / CRAWL.globalPerSec, biggest / perSite);
    peak = Math.min(perSite, CRAWL.globalPerSec);
  }
  return { seconds, peakPerSite: peak, coping: peak <= CRAWL.comfortable };
}
