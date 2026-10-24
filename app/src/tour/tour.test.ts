import { describe, expect, it } from "vitest";
import { BLOCK_MAP, defaultCfg } from "../blocks";
import { analyze } from "../sim/analyze";
import library from "../problems/library_management.json";
import { TOURS, nextStep, tourFor, type TourState } from "./tour";
import type { RFEdge, RFNode } from "../store/types";
import type { Design, Problem } from "../types";

const P = library as unknown as Problem;
const tour = tourFor("library_management")!;

const rf = (id: string, blockId: string, over: Record<string, unknown> = {}, caps?: string[], selected = false): RFNode =>
  ({
    id,
    type: "block",
    position: { x: 0, y: 0 },
    selected,
    data: { blockId, cfg: { ...defaultCfg(BLOCK_MAP[blockId]), ...over }, responsibilities: [], capabilities: caps },
  }) as RFNode;
const edge = (s: string, t: string): RFEdge => ({ id: s + t, source: s, target: t, data: { kind: "sync" } }) as RFEdge;

function stateOf(nodes: RFNode[], edges: RFEdge[], extra: Partial<TourState> = {}): TourState {
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
  return { nodes, edges, rightTab: "simulate", problem: P, run: analyze(design, P), ...extra };
}
const step = (id: string) => tour.steps.find((s) => s.id === id)!;

const chain = (dbCfg: Record<string, unknown>, serverCfg: Record<string, unknown> = {}, serverCaps?: string[]) =>
  stateOf(
    [rf("u", "user", { users: 60000, reqPerUser: 0.05 }), rf("s", "server", serverCfg, serverCaps), rf("db", "database", dbCfg)],
    [edge("u", "s"), edge("s", "db")],
  );

describe("library tour", () => {
  it("is registered for the library problem and every step has a title and body", () => {
    expect(TOURS.library_management).toBe(tour);
    for (const s of tour.steps) {
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.body.length).toBeGreaterThan(0);
    }
    expect(new Set(tour.steps.map((s) => s.id)).size).toBe(tour.steps.length);
  });

  it("finishes the building steps from what is on the canvas", () => {
    const empty = stateOf([], []);
    expect(step("add-user").done!(empty)).toBe(false);
    const s = chain({});
    expect(step("add-user").done!(s)).toBe(true);
    expect(step("add-server").done!(s)).toBe(true);
    expect(step("link-user-server").done!(s)).toBe(true);
    expect(step("link-server-db").done!(s)).toBe(true);
    expect(step("simulate").done!(s)).toBe(true);
    expect(step("link-server-db").done!(stateOf([rf("s", "server"), rf("db", "database")], []))).toBe(false);
  });

  it("points at the red database when it has no indexes, and skips that part when the queries are fine", () => {
    const broken = chain({});
    expect(step("open-db").skip!(broken)).toBe(false);
    expect(step("fix").done!(broken)).toBe(false);
    const fixed = chain({ indexes: ["books:isbn", "loans:member_id,due_date"] });
    expect(step("open-db").skip!(fixed)).toBe(true);
    expect(step("fix").done!(fixed)).toBe(true);
  });

  it("only asks about the server while it is overloaded, and about what it runs while requests go unserved", () => {
    const idx = { indexes: ["books:isbn", "loans:member_id,due_date"] };
    const one = chain(idx);
    expect(step("open-server").skip!(one)).toBe(false);
    const many = chain(idx, { replicas: 4 });
    expect(step("open-server").skip!(many)).toBe(true);
    expect(step("hosts").skip!(many)).toBe(false);
    const all = chain(
      idx,
      { replicas: 4 },
      P.capabilities!.filter((c) => c.mode !== "background").map((c) => c.id),
    );
    expect(step("hosts").skip!(all)).toBe(true);
  });

  it("walks past steps that do not apply", () => {
    const fixed = chain({ indexes: ["books:isbn", "loans:member_id,due_date"] }, { replicas: 4 });
    const at = tour.steps.findIndex((s) => s.id === "simulate");
    expect(tour.steps[nextStep(tour, at, fixed)].id).toBe("hosts");
  });
});
