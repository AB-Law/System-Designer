import { describe, expect, it } from "vitest";
import { BATON, FANOUT, MOVE, afterReading, canReplay, countsAsReplayable, fanout, moveMoney, partOf, staleRead } from "./dataTeaching";

/*
  Hand calculation.
    fan-out on write copies a notice to every member: 40 members = 40 copies, 4,000,000 = 4,000,000 copies. At 5,000 copies a second
    the last member waits 4,000,000 / 5,000 = 800 s, about 13 minutes. Fan-out on read makes 1 copy and each view looks in 30 places.
    moving 50 from savings 200 to current 100: the total stays 300. If the power fails after the first step with no transaction, savings
    is 150 and current 100, so 250 is left: 50 has vanished.
*/
describe("demo: fan-out", () => {
  it("on write, one notice is copied to every member and a view is one lookup", () => {
    const f = fanout(40, "write");
    expect(f.copiesPerPost).toBe(40);
    expect(f.lookupsPerView).toBe(1);
    expect(f.secondsToReach).toBeCloseTo(0.008, 6);
  });
  it("the famous club takes about 13 minutes to copy a notice to everyone", () => {
    const f = fanout(4_000_000, "write");
    expect(f.copiesPerPost).toBe(4_000_000);
    expect(f.secondsToReach).toBeCloseTo(800, 6);
  });
  it("on read, a post is one copy and a view looks in every place the member follows", () => {
    const f = fanout(4_000_000, "read");
    expect(f.copiesPerPost).toBe(1);
    expect(f.lookupsPerView).toBe(FANOUT.follows);
    expect(f.secondsToReach).toBeLessThan(0.001);
  });
  it("a mix copies ahead for small clubs and reads on demand for big ones", () => {
    expect(fanout(4000, "mix").mode).toBe("write");
    expect(fanout(4_000_000, "mix").mode).toBe("read");
    expect(fanout(FANOUT.mixLimit, "mix").mode).toBe("write");
  });
});

describe("demo: streams and queues", () => {
  it("the same key always goes to the same part, so its events stay in order", () => {
    expect(partOf("Runner 1")).toBe(partOf("Runner 1"));
    const view = afterReading(0).parts;
    const runner1 = view.flat().filter((e) => e.text.startsWith("Runner 1"));
    expect(runner1.map((e) => e.text)).toEqual(["Runner 1 starts", "Runner 1 hands over"]);
    const part = view.find((p) => p.some((e) => e.text === "Runner 1 starts"))!;
    expect(part.map((e) => e.text).indexOf("Runner 1 starts")).toBeLessThan(part.map((e) => e.text).indexOf("Runner 1 hands over"));
  });
  it("every event is in exactly one part", () => {
    expect(afterReading(0).parts.flat().length).toBe(BATON.events.length);
  });
  it("after reading, the stream still holds every event and the queue has only what is left", () => {
    const v = afterReading(4);
    expect(v.inLog).toBe(6);
    expect(v.inQueue).toBe(2);
    expect(v.parts.flat().filter((e) => e.read).length).toBe(4);
  });
  it("replay works within retention only, and counts as replayable from a day", () => {
    expect(canReplay(48, 30)).toBe(true);
    expect(canReplay(12, 30)).toBe(false);
    expect(countsAsReplayable(24)).toBe(true);
    expect(countsAsReplayable(23)).toBe(false);
  });
});

describe("demo: transactions", () => {
  it("with no failure the move works either way", () => {
    for (const t of [false, true]) {
      const m = moveMoney(t, false);
      expect(m.savings).toBe(150);
      expect(m.current).toBe(150);
      expect(m.total).toBe(300);
    }
  });
  it("a power cut after the first step loses money without a transaction", () => {
    const m = moveMoney(false, true);
    expect(m.savings).toBe(MOVE.savings - MOVE.amount);
    expect(m.current).toBe(MOVE.current);
    expect(m.total).toBe(250);
  });
  it("a transaction puts everything back", () => {
    const m = moveMoney(true, true);
    expect(m.savings).toBe(200);
    expect(m.current).toBe(100);
    expect(m.total).toBe(300);
  });
  it("someone adding up halfway sees a missing 50 unless the transaction keeps them out", () => {
    expect(moveMoney(false, false).auditHalfway).toBe(250);
    expect(moveMoney(true, false).auditHalfway).toBe(300);
  });
});

describe("demo: stale reads", () => {
  it("the original always shows the comment", () => {
    expect(staleRead("original", 3, 1, 0.8).seen).toBe(true);
  });
  it("a copy shows it only once it has caught up", () => {
    expect(staleRead("copy", 3, 1, 0.8).seen).toBe(false);
    expect(staleRead("copy", 3, 3, 0.8).seen).toBe(true);
    expect(staleRead("copy", 3, 5, 0.8).seen).toBe(true);
  });
  it("sending reads to copies takes load off the original", () => {
    expect(staleRead("copy", 3, 1, 0.8).originalLoad).toBeCloseTo(0.2, 6);
    expect(staleRead("copy", 3, 1, 0).originalLoad).toBe(1);
  });
});
