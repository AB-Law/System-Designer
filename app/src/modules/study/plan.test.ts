import { describe, expect, it } from "vitest";
import { forecastDays, intervalLabel, nextDueLabel } from "./plan";

describe("intervalLabel", () => {
  it("reads as days, weeks and months", () => {
    expect([0, 1, 6, 21, 90].map(intervalLabel)).toEqual(["Today", "1 day", "6 days", "3 weeks", "3 months"]);
  });
});

describe("nextDueLabel", () => {
  const now = Date.UTC(2026, 0, 10, 12);
  it("names the day", () => {
    expect(nextDueLabel(null, now)).toBeNull();
    expect(nextDueLabel(now + 3600_000, now)).toBe("later today");
    expect(nextDueLabel(now + 86_400_000, now)).toBe("tomorrow");
    expect(nextDueLabel(now + 3 * 86_400_000, now)).toBe("in 3 days");
  });
});

describe("forecastDays", () => {
  const base = { dueToday: 0, streak: 0, retention: null, totalReviews: 0 };
  it("is empty without a forecast or with nothing coming", () => {
    expect(forecastDays(base)).toEqual([]);
    expect(forecastDays({ ...base, forecast: [0, 0, 0, 0, 0, 0, 0] })).toEqual([]);
  });
  it("labels today first", () => {
    const r = forecastDays({ ...base, forecast: [2, 0, 5, 0, 0, 0, 1] });
    expect(r).toHaveLength(7);
    expect(r[0]).toEqual({ label: "Today", count: 2 });
    expect(r[2].count).toBe(5);
  });
});
