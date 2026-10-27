import { afterEach, describe, expect, it, vi } from "vitest";
import { BLOCK_MAP, defaultCfg } from "./blocks";
import { backend, loadProblems } from "./api";
import { analyze } from "./sim/analyze";
import type { Design } from "./types";

// Guard from plan/01-protecting-system-designer.md: Design Canvas must work with no backend at all.

afterEach(() => vi.unstubAllGlobals());

describe("standalone mode (API unreachable)", () => {
  it("loads the bundled problems and a design can be analyzed", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("Failed to fetch")));
    const problems = await loadProblems();
    expect(backend.online).toBe(false);
    expect(problems.length).toBeGreaterThan(5);

    const mk = (id: string, blockId: string) => ({
      id,
      blockId,
      cfg: defaultCfg(BLOCK_MAP[blockId]),
      responsibilities: [] as string[],
    });
    const design: Design = {
      nodes: [mk("u", "user"), mk("s", "server"), mk("db", "database")],
      edges: [
        { id: "us", source: "u", target: "s", kind: "sync" },
        { id: "sd", source: "s", target: "db", kind: "sync" },
      ],
    };
    const result = analyze(design, problems[0]);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.scenarios.length).toBe(problems[0].scenarios.length);
  });

  it("treats a backend error response as offline too", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(new Response("nope", { status: 502 })));
    const problems = await loadProblems();
    expect(backend.online).toBe(false);
    expect(problems.length).toBeGreaterThan(5);
  });
});
