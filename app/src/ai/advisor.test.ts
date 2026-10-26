import { describe, expect, it } from "vitest";
import { BLOCK_MAP, defaultCfg } from "../blocks";
import { analyze } from "../sim/analyze";
import us from "../problems/url_shortener.json";
import type { Design, Problem } from "../types";
import { buildAdvisorMessages, parseAdvisor } from "./advisor";

const P = us as unknown as Problem;
const mk = (id: string, blockId: string) => ({ id, blockId, cfg: defaultCfg(BLOCK_MAP[blockId]), responsibilities: [] as string[] });
const design: Design = {
  nodes: [mk("u", "user"), mk("s", "server"), mk("db", "database")],
  edges: [
    { id: "us", source: "u", target: "s", kind: "sync" },
    { id: "sdb", source: "s", target: "db", kind: "sync" },
  ],
};

const reply = (proposals: unknown[]) => JSON.stringify({ summary: "Needs a cache.", proposals });
const cache = {
  title: "Add a cache",
  why: "Most reads repeat.",
  changes: [
    { op: "add_block", ref: "c", blockId: "cache", settings: { hitRatio: 0.9 } },
    { op: "connect", from: "s", to: "c", kind: "sync" },
    { op: "connect", from: "c", to: "db", kind: "sync" },
    { op: "disconnect", from: "s", to: "db" },
  ],
};

describe("advisor", () => {
  it("tells the model the weak spots the simulator measured", () => {
    const msgs = buildAdvisorMessages(P, design, analyze(design, P), "fix");
    expect(msgs[1].content).toMatch(/Weak spots:\n- /);
    expect(msgs[1].content).toMatch(/MISSING/);
  });

  it("keeps a valid proposal with its reasoning and a plain-words summary", () => {
    const r = parseAdvisor(reply([cache]), P, design, "tune");
    expect(r.proposals).toHaveLength(1);
    expect(r.proposals[0].why).toBe("Most reads repeat.");
    expect(r.proposals[0].summary).toHaveLength(4);
    expect(r.proposals[0].status).toBe("pending");
  });

  it("finds the JSON through chatter, a code fence and a thinking block", () => {
    const text = `<think>{"a":1}</think>Sure!\n\`\`\`json\n${reply([cache])}\n\`\`\`\nHope that helps {really}.`;
    expect(parseAdvisor(text, P, design, "fix").proposals).toHaveLength(1);
  });

  it("drops a whole proposal when one change is invalid, and keeps the others", () => {
    const bad = { title: "Bad", why: "x", changes: [{ op: "add_block", ref: "z", blockId: "quantum", settings: {} }] };
    const r = parseAdvisor(reply([bad, cache]), P, design, "fix");
    expect(r.proposals.map((p) => p.title)).toEqual(["Add a cache"]);
  });

  it("ignores settings that do not exist and clamps numbers", () => {
    const p = { title: "Scale", why: "x", changes: [{ op: "set_settings", nodeId: "s", settings: { replicas: 1e9, nonsense: 1 } }] };
    const r = parseAdvisor(reply([p]), P, design, "tune");
    const c = r.proposals[0].changes[0];
    expect(c.op === "set_settings" && "nonsense" in c.settings).toBe(false);
    expect(c.op === "set_settings" && (c.settings.replicas as number) < 1e9).toBe(true);
  });

  it("refuses a reply that is not the expected JSON", () => {
    expect(() => parseAdvisor("I think you should add a cache.", P, design, "fix")).toThrow(/usable answer/);
  });
});

describe("advisor with a reply cut off by the context limit", () => {
  it("keeps the proposals that were finished", () => {
    const whole = JSON.stringify(cache);
    const text = `{"summary":"s","proposals":[${whole},{"title":"Second","why":"x","changes":[{"op":"add_blo`;
    const r = parseAdvisor(text, P, design, "fix");
    expect(r.proposals.map((p) => p.title)).toEqual(["Add a cache"]);
    expect(r.summary).toMatch(/cut off/);
  });
});

describe("advisor wiring repair", () => {
  it("connects a new block on to what the removed connection led to", () => {
    const rl = {
      title: "Rate limit",
      why: "x",
      changes: [
        { op: "add_block", ref: "rl", blockId: "rate_limiter", settings: {} },
        { op: "connect", from: "u", to: "rl", kind: "sync" },
        { op: "disconnect", from: "u", to: "s" },
      ],
    };
    const r = parseAdvisor(reply([rl]), P, design, "fix");
    expect(r.proposals[0].changes).toContainEqual({ op: "connect", from: "rl", to: "s", kind: "sync" });
  });
});

describe("advisor bypass repair", () => {
  it("removes the direct connection a new block is placed in front of", () => {
    const rl = {
      title: "Rate limit",
      why: "x",
      changes: [
        { op: "add_block", ref: "rl", blockId: "rate_limiter", settings: {} },
        { op: "connect", from: "u", to: "rl", kind: "sync" },
        { op: "connect", from: "rl", to: "s", kind: "sync" },
      ],
    };
    const r = parseAdvisor(reply([rl]), P, design, "fix");
    expect(r.proposals[0].changes).toContainEqual({ op: "disconnect", from: "u", to: "s" });
  });
});
