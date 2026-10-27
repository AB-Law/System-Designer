import { describe, expect, it } from "vitest";
import { activityText, ago, barWidth, daysLeftText, TIER_WORD, weekday } from "./format";
import { format, hashFor, parse } from "./route";

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

  it("words activity by module and ages it in days", () => {
    expect(activityText({ module: "study", ref: "c", at: 0, topics: ["Caching"] })).toBe("Reviewed a card on Caching");
    expect(activityText({ module: "interview", ref: "s", at: 0, topics: [] })).toContain("general");
    const now = 10 * 86_400_000;
    expect(ago(now, now)).toBe("Today");
    expect(ago(now - 86_400_000, now)).toBe("Yesterday");
    expect(ago(now - 3 * 86_400_000, now)).toBe("3 days ago");
    expect(weekday("2026-03-10")).toBe("Tue");
  });
});
