import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Problem, Submission } from "../types";
import { loadRoadmapPrefs, localSubmissions, markPrimerRead, statusFor } from "./progress";
import { allSteps } from "./roadmap";

const problems = import.meta.glob("../problems/*.json", { eager: true, import: "default" }) as Record<string, Problem>;

/** Browser storage as it was before Roadmap v2: nothing here may stop old data being read. */
const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
});
afterEach(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

const passing = { at: 1, score: 90, passed: 3, total: 3, result: {} } as unknown as Submission;

describe("saved data survives the roadmap change", () => {
  it("still reads a dc:roadmap value written before modules existed", () => {
    store.set("dc:roadmap", JSON.stringify({ primersRead: ["library_management"], skipOrderHint: true }));
    expect(loadRoadmapPrefs()).toEqual({ primersRead: ["library_management"], skipOrderHint: true });
    markPrimerRead("pastebin");
    expect(loadRoadmapPrefs()).toEqual({ primersRead: ["library_management", "pastebin"], skipOrderHint: true });
  });

  it("reads an empty or damaged dc:roadmap as no preferences", () => {
    expect(loadRoadmapPrefs()).toEqual({});
    store.set("dc:roadmap", "{not json");
    expect(loadRoadmapPrefs()).toEqual({});
  });

  it("every current problem is still on the path, once", () => {
    const ids = allSteps().map((s) => s.step.problemId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.sort()).toEqual(
      Object.values(problems)
        .map((p) => p.id)
        .sort(),
    );
  });

  for (const { step } of allSteps()) {
    it(`a saved design and submission for ${step.problemId} are still found by problem id`, () => {
      store.set(`dc:design:${step.problemId}`, JSON.stringify({ nodes: [{ id: "a" }], edges: [] }));
      expect(statusFor(step.problemId, undefined)).toBe("in_progress");
      store.set(`dc:subs:${step.problemId}`, JSON.stringify([passing]));
      expect(localSubmissions(step.problemId)).toHaveLength(1);
      expect(statusFor(step.problemId, undefined)).toBe("done");
    });
  }
});
