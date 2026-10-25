import { describe, expect, it } from "vitest";
import { timeoutOutcome } from "./timeoutModel";

/*
  Hand calculation. A provider with a typical time of 200 ms takes between 100 and 300 ms, spread evenly (width 200).
    timeout 400 (above the slowest): nobody times out, and the average wait is the middle, 200.
    timeout 200: calls slower than 200 time out: (300 - 200) / 200 = 50%. Average wait: half the calls finish between 100 and 200
      (average 150) and half give up at 200, so 0.5 x 150 + 0.5 x 200 = 175.
    timeout 150: (300 - 150) / 200 = 75% time out. Average wait: 25% finish between 100 and 150 (average 125) and 75% give up at 150,
      so 0.25 x 125 + 0.75 x 150 = 143.75.
    timeout 100 (at the fastest): every call times out and the wait is 100.
  On a bad day the typical time is 800 ms (400 to 1,200). With a timeout of 300, every call times out.
*/
describe("timeout teaching model", () => {
  it("a timeout above the slowest call loses nothing", () => {
    const o = timeoutOutcome(200, 400, false);
    expect(o.timedOut).toBe(0);
    expect(o.averageWaitMs).toBeCloseTo(200, 6);
  });
  it("a timeout at the typical time loses half the calls", () => {
    const o = timeoutOutcome(200, 200, false);
    expect(o.timedOut).toBeCloseTo(0.5, 6);
    expect(o.averageWaitMs).toBeCloseTo(175, 6);
  });
  it("a timeout shorter than the typical time throws away healthy answers", () => {
    const o = timeoutOutcome(200, 150, false);
    expect(o.timedOut).toBeCloseTo(0.75, 6);
    expect(o.answered).toBeCloseTo(0.25, 6);
    expect(o.averageWaitMs).toBeCloseTo(143.75, 6);
  });
  it("a timeout at or below the fastest call times everything out, and bounds the wait at the timeout", () => {
    const o = timeoutOutcome(200, 100, false);
    expect(o.timedOut).toBe(1);
    expect(o.averageWaitMs).toBe(100);
  });
  it("on a bad day a timeout caps how long visitors wait", () => {
    const o = timeoutOutcome(800, 300, true);
    expect(o.timedOut).toBe(1);
    expect(o.averageWaitMs).toBe(300);
    expect(o.pageShown).toBe(1); // a fallback keeps the page up
    expect(timeoutOutcome(800, 300, false).pageShown).toBe(0); // with none, a visitor gets an error
  });
  it("a timeout never makes the provider faster: the share answered can only fall as the timeout shrinks", () => {
    let last = 2;
    for (const t of [500, 400, 300, 200, 150, 100, 50]) {
      const a = timeoutOutcome(200, t, false).answered;
      expect(a).toBeLessThanOrEqual(last);
      last = a;
    }
  });
});
