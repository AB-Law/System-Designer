import { describe, expect, it } from "vitest";
import { bandTone, cite, comparable, compareComponents, compareRequirements, splitLines, splitSkills, when } from "./format";
import type { Component, Run } from "./types";

const comp = (key: string, score: number | null): Component => ({ key, label: key, score, detail: "", weight: 10 });
const run = (v: string, ev: [string, "met" | "partial" | "missing"][]): Run =>
  ({
    rubricVersion: v,
    evidence: ev.map(([text, status]) => ({ text, status, kind: "must", id: text, method: "", strength: 0, evidence: [], reason: "" })),
  }) as unknown as Run;

describe("cv format helpers", () => {
  it("maps bands to tones", () => {
    expect(bandTone("strong")).toBe("good");
    expect(bandTone("fair")).toBe("warn");
    expect(bandTone("weak")).toBe("bad");
  });
  it("writes citations with or without a page", () => {
    expect(cite({ line: 12, page: 2 })).toBe("page 2, line 12");
    expect(cite({ line: 4, page: null })).toBe("line 4");
    expect(cite({ line: null, page: null })).toBe("");
  });
  it("describes time simply", () => {
    const now = 10_000_000_000;
    expect(when(now - 20_000, now)).toBe("just now");
    expect(when(now - 5 * 60_000, now)).toBe("5 min ago");
    expect(when(now - 3 * 3_600_000, now)).toBe("3 h ago");
  });
  it("compares score components, leaving unrated ones without a change", () => {
    const d = compareComponents([comp("must", 50), comp("domain", null)], [comp("must", 75), comp("domain", 60)]);
    expect(d.find((x) => x.key === "must")?.change).toBe(25);
    expect(d.find((x) => x.key === "domain")?.change).toBeNull();
  });
  it("lists requirement changes with improvements first", () => {
    const a = run("1.0", [
      ["Kafka", "missing"],
      ["Go", "met"],
      ["AWS", "partial"],
    ]);
    const b = run("1.0", [
      ["Kafka", "met"],
      ["Go", "missing"],
      ["AWS", "partial"],
      ["Rust", "met"],
    ]);
    const c = compareRequirements(a, b);
    expect(c.map((x) => x.text)).toEqual(["Kafka", "Rust", "Go"]);
    expect(c[1]).toEqual({ text: "Rust", before: "absent", after: "met" });
  });
  it("only compares totals made under the same rubric", () => {
    expect(comparable(run("1.0", []), run("1.0", []))).toBe(true);
    expect(comparable(run("1.0", []), run("2.0", []))).toBe(false);
  });
  it("splits editor text", () => {
    expect(splitLines(" a \n\n b ")).toEqual(["a", "b"]);
    expect(splitSkills("Python, Go\nSQL ,")).toEqual(["Python", "Go", "SQL"]);
  });
});
