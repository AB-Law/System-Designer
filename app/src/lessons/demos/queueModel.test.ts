import { describe, expect, it } from "vitest";
import { QUEUE_DEMO, runQueue } from "./queueModel";

const lunch = (over: Partial<Parameters<typeof runQueue>[0]> = {}) =>
  runQueue({
    quiet: QUEUE_DEMO.quiet,
    rush: QUEUE_DEMO.rush,
    rushMinutes: QUEUE_DEMO.rushMinutes,
    drain: QUEUE_DEMO.workers * QUEUE_DEMO.perWorker,
    ...over,
  });

/*
  Hand calculation, as in the lesson. Two baristas make 20 drinks a minute.
    quiet morning, 10 orders a minute: the backlog stays at 0.
    rush, 30 a minute for 10 minutes: it grows by 30 - 20 = 10 a minute, so 10 after 1 minute, 50 after 5, 100 after 10.
    the longest wait is 100 / 20 = 5 minutes.
    after the rush, 10 a minute arrive and 20 are made: it shrinks by 10 a minute, so it is empty after 10 more minutes (minute 20).
    if 25 a minute arrived for good against 20 made: it grows by 5 a minute for ever (40 minutes: 200).
*/
describe("backlog teaching model", () => {
  it("a quiet day never builds a backlog", () => {
    const q = runQueue({ quiet: 10, rush: 10, rushMinutes: 0, drain: 20 });
    expect(q.peakBacklog).toBe(0);
    expect(q.clearedAt).toBe(0);
    expect(q.stillGrowing).toBe(false);
  });
  it("the lunchtime rush grows the backlog by 10 a minute", () => {
    const q = lunch();
    expect(q.minutes[0].backlog).toBe(10);
    expect(q.minutes[4].backlog).toBe(50);
    expect(q.minutes[9].backlog).toBe(100);
    expect(q.peakBacklog).toBe(100);
  });
  it("the unluckiest customer waits 5 minutes", () => {
    expect(lunch().longestWait).toBeCloseTo(5, 6);
  });
  it("after the rush the backlog shrinks by 10 a minute and is empty at minute 20", () => {
    const q = lunch();
    expect(q.minutes[14].backlog).toBe(50); // minute 15
    expect(q.minutes[19].backlog).toBe(0); // minute 20
    expect(q.clearedAt).toBe(20);
    expect(q.stillGrowing).toBe(false);
  });
  it("a rate that never falls below the drain rate grows for ever and never clears", () => {
    const q = runQueue({ quiet: 25, rush: 25, rushMinutes: 40, drain: 20 });
    expect(q.minutes[39].backlog).toBe(200);
    expect(q.clearedAt).toBeNull();
    expect(q.stillGrowing).toBe(true);
  });
  it("more workers shorten the wait; a third barista (30 a minute) means the rush never builds a queue", () => {
    expect(lunch({ drain: 30 }).peakBacklog).toBe(0);
    expect(lunch({ drain: 30 }).longestWait).toBe(0);
    expect(lunch({ drain: 40 }).longestWait).toBeLessThan(lunch().longestWait);
  });
});
