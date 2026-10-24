import { describe, expect, it } from "vitest";
import { copies, edgeOrigin, oneServer } from "./analyzeModels";

/*
  These demos call the real `analyze`, so the tests do two jobs: they pin the figures the lesson text quotes, and they check each one
  against a hand calculation, so a change to the engine that moves the lesson's numbers fails loudly.
*/

describe("demo: one server's limit", () => {
  it("serves everything while traffic is under capacity", () => {
    const o = oneServer(40, 100); // 40 of 100
    expect(o.served).toBe(1);
    expect(o.busy).toBeCloseTo(0.4, 6);
  });
  it("serves capacity / offered when traffic is over capacity", () => {
    expect(oneServer(120, 100).served).toBeCloseTo(100 / 120, 6); // five in six
    expect(oneServer(300, 100).served).toBeCloseTo(1 / 3, 6);
  });
  it("answers more slowly as the block fills up, and recovers with more capacity", () => {
    expect(oneServer(120, 100).responseMs).toBeGreaterThan(oneServer(40, 100).responseMs);
    expect(oneServer(120, 200).served).toBe(1);
  });
  it("costs more for a bigger server", () => {
    expect(oneServer(120, 200).monthlyCost).toBeGreaterThan(oneServer(120, 100).monthlyCost);
  });
});

describe("demo: copies behind a balancer", () => {
  it("three copies of 100 a second carry 120, and still do with one down", () => {
    const c = copies(3); // 3 x 100 = 300 >= 120; after a failure 2 x 100 = 200 >= 120
    expect(c.normal.served).toBe(1);
    expect(c.survivors).toBe(2);
    expect(c.oneDown.served).toBe(1);
  });
  it("two copies cannot carry 120 once one has failed: 100 / 120 is served", () => {
    const c = copies(2);
    expect(c.normal.served).toBe(1);
    expect(c.oneDown.served).toBeCloseTo(100 / 120, 6);
  });
  it("a single copy has nothing left when it fails", () => {
    const c = copies(1);
    expect(c.survivors).toBe(0);
    expect(c.oneDown.served).toBe(0);
    expect(c.normal.served).toBeCloseTo(100 / 120, 6);
  });
  it("each extra copy costs more", () => {
    expect(copies(4).normal.monthlyCost).toBeGreaterThan(copies(3).normal.monthlyCost);
  });
});

describe("demo: edge and origin", () => {
  // 1,000 requests a second; the origin answers 400 a second.
  it("without a CDN the origin sees everything and answers 400 of 1,000", () => {
    const e = edgeOrigin(0.9);
    expect(e.withoutCdn.reaching).toBeCloseTo(1000, 6);
    expect(e.withoutCdn.served).toBeCloseTo(0.4, 6);
  });
  it("at a 90% hit ratio, 100 a second reach the origin and everything is served", () => {
    const e = edgeOrigin(0.9);
    expect(e.withCdn.reaching).toBeCloseTo(1000 * 0.1, 6);
    expect(e.withCdn.busy).toBeCloseTo(100 / 400, 6);
    expect(e.withCdn.served).toBe(1);
  });
  it("at 50%, 500 reach an origin that can answer 400: served = (500 + 400) / 1,000", () => {
    const e = edgeOrigin(0.5);
    expect(e.withCdn.reaching).toBeCloseTo(500, 6);
    expect(e.withCdn.served).toBeCloseTo(0.9, 6);
  });
  it("a CDN adds to the monthly cost", () => {
    const e = edgeOrigin(0.9);
    expect(e.withCdn.monthlyCost).toBeGreaterThan(e.withoutCdn.monthlyCost);
  });
});
