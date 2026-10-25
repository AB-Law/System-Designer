import { describe, expect, it } from "vitest";
import { CACHE_DEMO, cacheOutcome, loadMultiple } from "./cacheModel";

/*
  Hand calculation, 10,000 reads a second:
    90% hit -> 10% miss -> 10,000 x 0.10 = 1,000 reads a second reach the database (1,000 / 2,000 = 50% busy)
    50% hit -> 50% miss -> 10,000 x 0.50 = 5,000 reads a second reach the database (5,000 / 2,000 = 250%: it cannot keep up)
    so the database load is 5,000 / 1,000 = 5 times higher.
*/
describe("cache teaching model", () => {
  const before = cacheOutcome(CACHE_DEMO.before);
  const after = cacheOutcome(CACHE_DEMO.after);

  it("matches the hand calculation at 90%", () => {
    expect(before.dbReadsPerSec).toBeCloseTo(1000, 6);
    expect(before.dbUtilisation).toBeCloseTo(0.5, 6);
    expect(before.overloaded).toBe(false);
  });
  it("matches the hand calculation at 50%", () => {
    expect(after.dbReadsPerSec).toBeCloseTo(5000, 6);
    expect(after.dbUtilisation).toBeCloseTo(2.5, 6);
    expect(after.overloaded).toBe(true);
  });
  it("is five times the load", () => {
    expect(loadMultiple(before, after)).toBeCloseTo(5, 6);
  });
  it("sends everything to the database with no cache hits, and uses the app's 98% ceiling", () => {
    expect(cacheOutcome(0).dbReadsPerSec).toBeCloseTo(10000, 6);
    expect(cacheOutcome(1).hitRatio).toBe(0.98);
    expect(cacheOutcome(1).dbReadsPerSec).toBeCloseTo(200, 6);
  });
});
