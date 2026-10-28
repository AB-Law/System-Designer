import { describe, expect, it } from "vitest";
import {
  activityText,
  ago,
  barWidth,
  daysLeftText,
  overallReadiness,
  readinessTier,
  resumeItems,
  splitTopics,
  TIER_WORD,
  weekday,
} from "./format";
import { format, hashFor, parse } from "./route";
import type { TopicCard } from "./types";

describe("hub routes", () => {
  it("round-trips known paths and sends unknown ones home", () => {
    expect(parse("targets")).toEqual({ name: "targets" });
    expect(format({ name: "targets" })).toBe("targets");
    expect(parse("")).toEqual({ name: "home" });
    expect(parse("targets/9")).toEqual({ name: "home" });
    expect(hashFor({ name: "home" })).toBe("#/hub");
    expect(hashFor({ name: "targets" })).toBe("#/hub/targets");
  });
});

describe("hub formatting", () => {
  it("says 'no data yet' instead of showing a zero", () => {
    expect(TIER_WORD.none).toBe("No data yet");
    expect(barWidth(null, "none")).toBe("0%");
    expect(barWidth(0.724, "building")).toBe("72%");
  });

  it("describes how far away the interview is", () => {
    expect(daysLeftText(null)).toBe("");
    expect(daysLeftText(-2)).toBe("date passed");
    expect(daysLeftText(0)).toBe("today");
    expect(daysLeftText(1)).toBe("tomorrow");
    expect(daysLeftText(18)).toBe("18 days away");
  });

  it("leads with the three weakest topics that have data and leaves empty ones out of the way", () => {
    const t = (slug: string, tier: TopicCard["tier"], strength: number | null): TopicCard => ({
      slug,
      label: slug,
      tier,
      strength,
      points: strength === null ? 0 : 3,
      relevant: false,
      sources: [],
    });
    const got = splitTopics([
      t("a", "strong", 0.9),
      t("b", "none", null),
      t("c", "needs_work", 0.2),
      t("d", "building", 0.5),
      t("e", "needs_work", 0.3),
      t("f", "strong", 0.8),
    ]);
    expect(got.focus.map((x) => x.slug)).toEqual(["c", "e", "d"]);
    expect(got.rest.map((x) => x.slug)).toEqual(["a", "f"]);
    expect(got.empty.map((x) => x.slug)).toEqual(["b"]);
    expect(splitTopics([t("b", "none", null)]).focus).toEqual([]);
  });

  it("offers the last interview and study session to carry on from, newest first", () => {
    const now = 5 * 86_400_000;
    const items = resumeItems(
      [
        { module: "study", ref: "study_card:4", at: now, topics: ["Caching"] },
        { module: "interview", ref: "interview_session:12", at: now - 86_400_000, topics: ["Security"] },
        { module: "interview", ref: "interview_session:3", at: 0, topics: [] },
      ],
      now,
    );
    expect(items.map((i) => [i.key, i.href])).toEqual([
      ["interview", "#/interview/session/12"],
      ["study", "#/study"],
    ]);
    expect(items[0].detail).toBe("Security · Yesterday");
    expect(resumeItems([])).toEqual([]);
  });

  it("words activity by module and ages it in days", () => {
    expect(activityText({ module: "study", ref: "c", at: 0, topics: ["Caching"] })).toBe("Reviewed a card on Caching");
    expect(activityText({ module: "interview", ref: "s", at: 0, topics: [] })).toContain("general");
    const now = 10 * 86_400_000;
    expect(ago(now, now)).toBe("Today");
    expect(ago(now - 86_400_000, now)).toBe("Yesterday");
    expect(ago(now - 3 * 86_400_000, now)).toBe("3 days ago");
    expect(weekday("2026-03-10")).toBe("Tue");
  });

  it("averages topics with evidence into one readiness number", () => {
    const t = (strength: number | null, tier: TopicCard["tier"], extra = false): TopicCard => ({
      slug: `t${strength}${tier}${extra}`,
      label: "x",
      tier,
      strength,
      points: 3,
      relevant: false,
      sources: [],
      extra,
    });
    expect(overallReadiness([])).toBeNull();
    expect(overallReadiness([t(null, "none")])).toBeNull();
    expect(overallReadiness([t(0.8, "strong"), t(0.4, "needs_work"), t(0.9, "strong", true), t(null, "none")])).toEqual({
      score: 60,
      topics: 2,
    });
    expect(readinessTier(75)).toBe("strong");
    expect(readinessTier(50)).toBe("building");
    expect(readinessTier(49)).toBe("needs_work");
  });
});
