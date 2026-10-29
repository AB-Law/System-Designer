import { describe, expect, it } from "vitest";
import { arcPath, moduleNodes, ringSegments, segmentSpan, weakestLink } from "./systemModel";
import type { Summary, TopicCard } from "./types";

const NOW = Date.parse("2026-10-29T12:00:00Z");
const day = 86_400_000;

const topic = (slug: string, strength: number | null, sources: string[], extra = false): TopicCard => ({
  slug,
  label: slug,
  tier: strength === null ? "none" : strength >= 0.75 ? "strong" : strength >= 0.5 ? "building" : "needs_work",
  strength,
  points: strength === null ? 0 : 3,
  relevant: true,
  sources,
  extra,
});

const summary = (over: Partial<Summary> = {}): Summary =>
  ({
    setup: [],
    target: null,
    targets: [],
    readiness: [],
    track: { slug: "x", label: "x", source: "default" },
    fit: null,
    actions: [],
    activity: [],
    streak: { days: 0, week: [] },
    dataPoints: 0,
    modules: ["cv", "interview", "study"],
    ...over,
  }) as Summary;

describe("moduleNodes", () => {
  it("rates a module by the topics it recorded, and the CV by its fit score", () => {
    const s = summary({
      readiness: [topic("caching", 0.4, ["study"]), topic("sharding", 0.9, ["study", "interview"])],
      fit: { runId: 1, total: 71, band: null, gaps: [] },
    });
    const nodes = Object.fromEntries(moduleNodes(s, NOW).map((n) => [n.id, n]));
    expect(nodes.study.strength).toBeCloseTo(0.65);
    expect(nodes.study.health).toBe("building");
    expect(nodes.interview.health).toBe("strong");
    expect(nodes.cv.detail).toBe("71 / 100");
    expect(nodes.cv.health).toBe("building");
  });

  it("counts only this week's activity and calls an untouched module quiet", () => {
    const s = summary({
      activity: [
        { module: "study", ref: "a", at: NOW - 1 * day, topics: [] },
        { module: "study", ref: "b", at: NOW - 6 * day, topics: [] },
        { module: "study", ref: "c", at: NOW - 9 * day, topics: [] },
      ],
    });
    const nodes = Object.fromEntries(moduleNodes(s, NOW).map((n) => [n.id, n]));
    expect(nodes.study.week).toBe(2);
    expect(nodes.study.detail).toBe("2 this week");
    expect(nodes.interview.health).toBe("quiet");
    expect(nodes.design.detail).toBe("Quiet this week");
  });

  it("marks modules that are switched off as unavailable", () => {
    const nodes = moduleNodes(summary({ modules: ["study"] }), NOW);
    expect(nodes.find((n) => n.id === "cv")?.available).toBe(false);
    expect(nodes.find((n) => n.id === "design")?.available).toBe(true);
  });
});

describe("weakestLink", () => {
  it("picks the module with the weakest evidence", () => {
    const s = summary({ readiness: [topic("a", 0.3, ["interview"]), topic("b", 0.8, ["study"])] });
    expect(weakestLink(moduleNodes(s, NOW))?.id).toBe("interview");
  });
  it("falls back to a module that has gone quiet, and to null when all are strong", () => {
    expect(weakestLink(moduleNodes(summary(), NOW))?.health).toBe("quiet");
    const strong = summary({
      modules: ["study"],
      readiness: [topic("a", 0.9, ["study", "design"])],
      activity: [{ module: "design", ref: "x", at: NOW, topics: [] }],
    });
    expect(weakestLink(moduleNodes(strong, NOW))).toBeNull();
  });
});

describe("ringSegments and arcs", () => {
  it("leaves out topics outside the track and caps the count", () => {
    const topics = [topic("a", 0.5, []), topic("b", 0.5, [], true), ...Array.from({ length: 20 }, (_, i) => topic(`t${i}`, 0.5, []))];
    const segs = ringSegments(topics);
    expect(segs.length).toBe(12);
    expect(segs.some((s) => s.slug === "b")).toBe(false);
  });
  it("shows a topic with nothing recorded as an empty segment", () => {
    expect(ringSegments([topic("a", null, [])])[0].strength).toBeNull();
  });
  it("divides the circle evenly with a gap between segments", () => {
    expect(segmentSpan(0, 4)).toEqual({ from: 2, to: 88 });
    expect(segmentSpan(3, 4)).toEqual({ from: 272, to: 358 });
  });
  it("draws a quarter turn as a short arc and a half turn or more as a large one", () => {
    expect(arcPath(100, 100, 50, 0, 90)).toBe("M100.00 50.00 A50 50 0 0 1 150.00 100.00");
    expect(arcPath(100, 100, 50, 0, 270)).toContain(" 0 1 1 ");
  });
});
