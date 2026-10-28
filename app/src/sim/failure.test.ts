import { describe, expect, it } from "vitest";
import { BLOCK_MAP, defaultCfg } from "../blocks";
import blog from "../problems/personal_blog.json";
import type { Design, Problem } from "../types";
import { analyze } from "./analyze";

const problem = blog as unknown as Problem;
const mk = (id: string, blockId: string, over: Record<string, unknown> = {}) => ({
  id,
  blockId,
  cfg: { ...defaultCfg(BLOCK_MAP[blockId]), ...over },
  responsibilities: [] as string[],
});
const e = (s: string, t: string) => ({ id: s + t, source: s, target: t, kind: "sync" as const });
const user = mk("u", "user", { users: problem.traffic.users, reqPerUser: problem.traffic.reqPerUser });

const twoServers: Design = {
  nodes: [user, mk("lb", "load_balancer"), mk("s1", "server"), mk("s2", "server"), mk("db", "database")],
  edges: [e("u", "lb"), e("lb", "s1"), e("lb", "s2"), e("s1", "db"), e("s2", "db")],
};
const oneServer: Design = {
  nodes: [user, mk("lb", "load_balancer"), mk("s1", "server"), mk("db", "database")],
  edges: [e("u", "lb"), e("lb", "s1"), e("s1", "db")],
};

const down = (d: Design) => analyze(d, problem).scenarios.find((s) => s.scenarioId === "server_down")!;

describe("a server fails", () => {
  it("says the other server takes over, not that the design has no spare", () => {
    const r = down(twoServers);
    expect(r.served).toBeGreaterThan(0.97);
    expect(r.pass).toBe(true);
    expect(r.notes[0]).toMatch(/went down\. .*takes? over/);
    expect(r.notes.join(" ")).not.toMatch(/no spare instance/);
  });

  it("the survivor carries the load the failed server had", () => {
    const before = analyze(twoServers, problem).scenarios.find((s) => s.scenarioId === "normal")!;
    const after = down(twoServers);
    const util = (r: typeof after, id: string) => r.nodes[id].utilization ?? 0;
    expect(util(after, "s2")).toBeGreaterThan(util(before, "s2") * 1.5);
  });

  it("with one server, nothing can take over and the check fails the same way everywhere", () => {
    const r = down(oneServer);
    expect(r.notes[0]).toMatch(/no other block can do its job/);
    expect(r.pass).toBe(false);
    const result = analyze(oneServer, problem);
    expect(result.requirements.find((q) => q.id === "r-down")?.met).toBe(false);
    expect(result.scenarios.filter((s) => s.pass).length).toBeLessThan(result.scenarios.length);
  });

  it("the requirement and the scenario agree, and a quiet design does not pass by sending less traffic", () => {
    const quiet: Design = { ...twoServers, nodes: [mk("u", "user", { users: 4000, reqPerUser: 0.02 }), ...twoServers.nodes.slice(1)] };
    const result = analyze(quiet, problem);
    const scenario = result.scenarios.find((s) => s.scenarioId === "server_down")!;
    const req = result.requirements.find((q) => q.id === "r-down")!;
    expect(req.met).toBe(scenario.pass);
    expect(scenario.pass).toBe(false);
    expect(req.detail).toMatch(/User blocks send/);
  });
});
