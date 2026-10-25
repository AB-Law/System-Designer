import { describe, expect, it } from "vitest";
import { BIKES, FEE, budget, matchRiders, payTaps, reconcile, ridersByArea, weatherAlerts } from "./realTimeModels";

/*
  Hand calculation.
    Bikes: 40 riders, 4 areas of 10 bikes, a claim holds the lock for 20 ms. One lock for the city: 40 x 20 = 800 ms. A lock on each
    bike: 20 ms. A quarter of the riders in the busy area gives 10 each, so all 40 are matched. Half in the busy area gives [20, 7, 7, 6]:
    10 + 7 + 7 + 6 = 30 matched. All in the busy area gives [40, 0, 0, 0]: 10 matched, 30 turned away.
    Gym fee: 3 taps at 12 pounds. No key: 3 charges, 6 ledger lines, 36 pounds out. A key: 1 charge, 2 lines, 12 pounds out. Lines add to 0.
    Reconciliation: A1, A2, A3, A6 agree. A4 differs (45 and 54). A5 and A7 are only ours, A7 being after the cut-off. A8 is only theirs.
    Without allowing for the late one, 4 lines disagree; allowing for it, 3.
    Budget: the three essential steps take 10 + 15 + 25 = 50 ms and cost 80 + 60 + 110 = 250. Both optional steps before answering:
    50 + 45 + 70 = 165 ms and 250 + 70 + 120 = 440. On a bad day (x10): 50 + 450 + 700 = 1,200 ms. Loyalty with a 50 ms limit and no suggestion:
    50 + 45 = 95 ms and 250 + 70 = 320; on a bad day the limit holds it to 50 + 50 = 100 ms. Both in the background: 50 ms and 440 + 90 = 530.
*/
describe("demo: losing a region", () => {
  it("a single region goes down with everything in it", () => {
    expect(weatherAlerts("one", true).downServed).toBe(0);
    expect(weatherAlerts("one", true).normalServed).toBe(1);
  });
  it("servers in a second region do not help while the data stays in the first", () => {
    expect(weatherAlerts("servers", true).downServed).toBe(0);
  });
  it("a copy of the data lets the second region carry on, but only if it can carry all the traffic", () => {
    expect(weatherAlerts("servers-and-data", false).downServed).toBeGreaterThan(0.5);
    expect(weatherAlerts("servers-and-data", false).downServed).toBeLessThan(0.8);
    expect(weatherAlerts("servers-and-data", true).downServed).toBe(1);
  });
  it("a second region with its data also makes Europe quicker and the bill larger", () => {
    const one = weatherAlerts("one", true);
    const both = weatherAlerts("servers-and-data", true);
    expect(both.europeMs).toBeLessThan(one.europeMs);
    expect(both.monthlyCost).toBeGreaterThan(one.monthlyCost);
  });
});

describe("demo: live matching", () => {
  it("spreads riders with the chosen share in the busy area", () => {
    expect(ridersByArea(0.25)).toEqual([10, 10, 10, 10]);
    expect(ridersByArea(0.5)).toEqual([20, 7, 7, 6]);
    expect(ridersByArea(1)).toEqual([40, 0, 0, 0]);
  });
  it("one lock for the city makes the last rider wait for every claim", () => {
    expect(matchRiders("city", 0.25).lastAnswerMs).toBe(BIKES.riders * BIKES.claimMs);
    expect(matchRiders("bike", 0.25).lastAnswerMs).toBe(BIKES.claimMs);
  });
  it("a lock does not create bikes: a crowd in one area is turned away either way", () => {
    for (const lock of ["city", "bike"] as const) {
      expect(matchRiders(lock, 0.25).turnedAway).toBe(0);
      expect(matchRiders(lock, 0.5).matched).toBe(30);
      expect(matchRiders(lock, 1).matched).toBe(10);
      expect(matchRiders(lock, 1).turnedAway).toBe(30);
    }
  });
});

describe("demo: payment taps and the ledger", () => {
  it("without a key every tap is a new payment", () => {
    const r = payTaps(3, false);
    expect(r.charges).toBe(3);
    expect(r.ledgerLines).toHaveLength(6);
    expect(r.customerOut).toBe(3 * FEE.pounds);
  });
  it("with a key the retries are told the first result", () => {
    const r = payTaps(3, true);
    expect(r.charges).toBe(1);
    expect(r.ledgerLines).toHaveLength(2);
    expect(r.customerOut).toBe(FEE.pounds);
  });
  it("the ledger lines always add up to nothing", () => {
    for (const taps of [1, 2, 5]) for (const key of [true, false]) expect(payTaps(taps, key).lineTotal).toBe(0);
  });
});

describe("demo: reconciliation", () => {
  const problems = (allow: boolean) => reconcile(allow).filter((l) => l.finding !== "agree" && l.finding !== "late");
  it("four lines disagree at first sight", () => {
    expect(problems(false).map((l) => l.id)).toEqual(["A4", "A5", "A7", "A8"]);
  });
  it("one of them is only timing, because it was made after the cut-off", () => {
    expect(problems(true).map((l) => l.id)).toEqual(["A4", "A5", "A8"]);
    expect(reconcile(true).find((l) => l.id === "A7")?.finding).toBe("late");
  });
  it("names the kind of difference", () => {
    const by = Object.fromEntries(reconcile(true).map((l) => [l.id, l.finding]));
    expect(by).toMatchObject({ A1: "agree", A4: "amount", A5: "only-ours", A8: "only-theirs" });
  });
});

describe("demo: a time and money budget", () => {
  it("optional steps before answering put the page over its time", () => {
    const b = budget({ loyalty: "before", suggest: "before" }, false);
    expect(b.ms).toBe(165);
    expect(b.dollars).toBe(440);
    expect(b.withinTime).toBe(false);
    expect(b.withinMoney).toBe(true);
    expect(budget({ loyalty: "before", suggest: "before" }, true).ms).toBe(1200);
  });
  it("a time limit keeps a bad day close to a normal one", () => {
    const choice = { loyalty: "limited", suggest: "out" } as const;
    expect(budget(choice, false)).toMatchObject({ ms: 95, dollars: 320, withinTime: true, withinMoney: true });
    expect(budget(choice, true).ms).toBe(100);
  });
  it("the background buys speed with money", () => {
    const b = budget({ loyalty: "background", suggest: "background" }, true);
    expect(b.ms).toBe(50);
    expect(b.dollars).toBe(530);
    expect(b.withinMoney).toBe(false);
  });
});
