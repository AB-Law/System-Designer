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

import { forum, notices } from "./analyzeModels";

/*
  Hand calculation. One database node answers 500 reads and 500 writes a second. The app's database always has at least one read
  copy, so "1 copy" is the smallest design: reads are answered by 500 x (1 + 1) = 1,000 a second, and writes by the original alone.
  The most requests a second at a write share w is 1 / ((1 - w) / readLimit + w / writeLimit).
    1 copy,  w = 3%:  1 / (0.97 / 1000 + 0.03 / 500)  = 1 / 0.00103  =  970.9  -> 970.9 / 1,500 = 65% of 1,500 served
    3 copies, w = 3%: 1 / (0.97 / 2000 + 0.03 / 500)  = 1 / 0.000545 = 1,834.9 -> all 1,500 served
    w = 40%, 6 copies: 1 / (0.6 / 3500 + 0.4 / 500)   = 1 / 0.000971 = 1,029   -> 69% served: the write limit is the ceiling
    w = 40%, 1 copy, 2 slices (1,000 reads and 1,000 writes... x2): read 2,000, write 1,000: 1 / (0.6 / 2000 + 0.4 / 1000) = 1,428.6 -> 95%
*/
describe("demo: copies and slices of a database", () => {
  it("the smallest design answers 1,000 reads and 500 writes a second", () => {
    const f = forum(1, 1);
    expect(f.readLimit).toBeCloseTo(1000, 6);
    expect(f.writeLimit).toBeCloseTo(500, 6);
  });
  it("more copies raise the read limit and leave the write limit exactly where it was", () => {
    const f = forum(3, 1); // reads: 500 x (1 + 3) = 2,000
    expect(f.readLimit).toBeCloseTo(2000, 6);
    expect(f.writeLimit).toBeCloseTo(500, 6);
    expect(forum(6, 1).writeLimit).toBeCloseTo(500, 6);
  });
  it("two slices double both limits, because each slice takes its own writes", () => {
    const f = forum(1, 2);
    expect(f.readLimit).toBeCloseTo(2000, 6);
    expect(f.writeLimit).toBeCloseTo(1000, 6);
  });
  it("the forum's 1,500 requests a second: one copy serves 65%, three copies serve everything", () => {
    const f = forum(1, 1);
    expect(f.reads).toBeCloseTo(1455, 6);
    expect(f.writes).toBeCloseTo(45, 6);
    expect(f.served).toBeCloseTo(970.87 / 1500, 3);
    expect(forum(3, 1).served).toBe(1);
  });
  it("copies cannot rescue a write-heavy forum: 40% writes is 600 a second against 500", () => {
    const heavy = forum(6, 1, 0.4);
    expect(heavy.writes).toBeCloseTo(600, 6);
    expect(heavy.served).toBeCloseTo(1029 / 1500, 2);
    const sliced = forum(1, 2, 0.4);
    expect(sliced.served).toBeCloseTo(1428.57 / 1500, 3); // slices take the extra writes
    expect(sliced.served).toBeGreaterThan(heavy.served);
  });
  it("copies cost money and so do slices", () => {
    expect(forum(3, 1).monthlyCost).toBeGreaterThan(forum(1, 1).monthlyCost);
    expect(forum(1, 2).monthlyCost).toBeGreaterThan(forum(1, 1).monthlyCost);
  });
});

describe("demo: regions and distance", () => {
  it("with everything in US East, distance is added to every call: US is the baseline, Europe +85 ms, Asia Pacific +160 ms", () => {
    const n = notices(false, false);
    expect(n.byRegion.eu - n.byRegion.us).toBeCloseTo(85, 6);
    expect(n.byRegion.ap - n.byRegion.us).toBeCloseTo(160, 6);
  });
  it("servers near the visitors do not help while the data is still far away", () => {
    expect(notices(true, false).byRegion).toEqual(notices(false, false).byRegion);
  });
  it("servers plus a read copy of the data in each region make every region as quick as the home region", () => {
    const n = notices(true, true).byRegion;
    expect(n.eu).toBeCloseTo(n.us, 6);
    expect(n.ap).toBeCloseTo(n.us, 6);
  });
  it("a copy of the data costs money", () => {
    expect(notices(true, true).monthlyCost).toBeGreaterThan(notices(true, false).monthlyCost);
  });
});
