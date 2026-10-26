import { describe, expect, it } from "vitest";
import { BLOCK_MAP, defaultCfg } from "../blocks";
import { analyze } from "../sim/analyze";
import blog from "../problems/personal_blog.json";
import portfolio from "../problems/photo_portfolio.json";
import poll from "../problems/class_poll.json";
import { TOURS, tourFor, type TourState } from "./tour";
import type { RFEdge, RFNode } from "../store/types";
import type { Design, Problem } from "../types";

const rf = (id: string, blockId: string, over: Record<string, unknown> = {}, caps?: string[]): RFNode =>
  ({
    id,
    type: "block",
    position: { x: 0, y: 0 },
    selected: false,
    data: { blockId, cfg: { ...defaultCfg(BLOCK_MAP[blockId]), ...over }, responsibilities: [], capabilities: caps },
  }) as RFNode;
const edge = (s: string, t: string): RFEdge => ({ id: s + t, source: s, target: t, data: { kind: "sync" } }) as RFEdge;

function stateOf(p: Problem, nodes: RFNode[], edges: RFEdge[], extra: Partial<TourState> = {}): TourState {
  const design: Design = {
    nodes: nodes.map((n) => ({
      id: n.id,
      blockId: n.data.blockId,
      cfg: n.data.cfg,
      responsibilities: [],
      capabilities: n.data.capabilities,
    })),
    edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, kind: "sync" as const })),
  };
  return { nodes, edges, rightTab: "simulate", problem: p, run: analyze(design, p), ...extra };
}

const BLOG = blog as unknown as Problem;
const PORTFOLIO = portfolio as unknown as Problem;
const POLL = poll as unknown as Problem;

describe.each([
  ["personal_blog", BLOG],
  ["photo_portfolio", PORTFOLIO],
  ["class_poll", POLL],
])("guided tour for %s", (id) => {
  const tour = tourFor(id)!;
  it("is registered, with a title and body on every step and unique ids", () => {
    expect(TOURS[id]).toBe(tour);
    for (const s of tour.steps) {
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.body.length).toBeGreaterThan(0);
    }
    expect(new Set(tour.steps.map((s) => s.id)).size).toBe(tour.steps.length);
  });
  it("starts with an explanation, not a task, and ends with one", () => {
    expect(tour.steps[0].done).toBeUndefined();
    expect(tour.steps[tour.steps.length - 1].done).toBeUndefined();
  });
});

describe("blog tour", () => {
  const tour = tourFor("personal_blog")!;
  const step = (id: string) => tour.steps.find((s) => s.id === id)!;
  const base = (reps: number) =>
    stateOf(
      BLOG,
      [rf("u", "user"), rf("s", "server", { replicas: reps, capacity: 500 }), rf("db", "database")],
      [edge("u", "s"), edge("s", "db")],
    );
  it("asks for enough copies that losing one still covers the 1,200 a second peak", () => {
    expect(step("scale").done!(base(2))).toBe(false);
    expect(step("scale").done!(base(3))).toBe(false);
    expect(step("scale").done!(base(4))).toBe(true);
  });
  it("finishes the load balancer step once it sits between the user and the server", () => {
    const s = stateOf(
      BLOG,
      [rf("u", "user"), rf("lb", "load_balancer"), rf("s", "server"), rf("db", "database")],
      [edge("u", "lb"), edge("lb", "s"), edge("s", "db")],
    );
    expect(step("add-lb").done!(s)).toBe(true);
    expect(step("add-lb").done!(base(3))).toBe(false);
  });
});

describe("portfolio tour", () => {
  const tour = tourFor("photo_portfolio")!;
  const step = (id: string) => tour.steps.find((s) => s.id === id)!;
  it("needs the CDN in front and its static share set", () => {
    const withCdn = (share: number) =>
      stateOf(PORTFOLIO, [rf("u", "user"), rf("c", "cdn", { staticShare: share }), rf("s", "server")], [edge("u", "c"), edge("c", "s")]);
    expect(step("add-cdn").done!(withCdn(0.3))).toBe(true);
    expect(step("static").done!(withCdn(0.3))).toBe(false);
    expect(step("static").done!(withCdn(0.9))).toBe(true);
    expect(step("add-cdn").done!(stateOf(PORTFOLIO, [rf("u", "user"), rf("s", "server")], [edge("u", "s")]))).toBe(false);
  });
  it("needs the server joined to both the database and blob storage", () => {
    const part = stateOf(
      PORTFOLIO,
      [rf("u", "user"), rf("s", "server"), rf("db", "database"), rf("b", "blob_storage")],
      [edge("u", "s"), edge("s", "db")],
    );
    expect(step("link").done!(part)).toBe(false);
    const all = stateOf(
      PORTFOLIO,
      [rf("u", "user"), rf("s", "server"), rf("db", "database"), rf("b", "blob_storage")],
      [edge("u", "s"), edge("s", "db"), edge("s", "b")],
    );
    expect(step("link").done!(all)).toBe(true);
  });
});

describe("poll tour", () => {
  const tour = tourFor("class_poll")!;
  const step = (id: string) => tour.steps.find((s) => s.id === id)!;
  const withLocking = (consistency: string) =>
    stateOf(
      POLL,
      [rf("u", "user"), rf("s", "server", {}, ["vote"]), rf("db", "database", { consistency })],
      [edge("u", "s"), edge("s", "db")],
    );
  it("finishes the locking step only when writes are protected", () => {
    expect(step("lock").done!(withLocking("Eventual"))).toBe(false);
    expect(step("lock").done!(withLocking("Row locks"))).toBe(true);
    expect(step("lock").done!(withLocking("Serializable"))).toBe(true);
  });
  it("skips a capacity step when that block is not overloaded", () => {
    const big = stateOf(
      POLL,
      [
        rf("u", "user"),
        rf("s", "server", { replicas: 10 }, ["vote"]),
        rf("db", "database", { consistency: "Row locks", capacity: 100000 }),
      ],
      [edge("u", "s"), edge("s", "db")],
    );
    expect(step("db-capacity").skip!(big)).toBe(true);
    expect(step("server-capacity").skip!(big)).toBe(true);
  });
});
