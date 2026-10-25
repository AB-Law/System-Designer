import { describe, expect, it } from "vitest";
import { playRace } from "./raceModel";

describe("two writers teaching model", () => {
  it("without a lock, one withdrawal is lost: both start from 100, so the account ends at 50 after 100 was paid out", () => {
    const r = playRace(false);
    expect(r.finalBalance).toBe(50);
    expect(r.paidOut).toBe(100);
    expect(r.expected).toBe(0);
    expect(r.finalBalance).not.toBe(r.expected);
    expect(r.steps.map((s) => s.balance)).toEqual([100, 100, 50, 50]);
    expect(r.steps.some((s) => s.waiting)).toBe(false);
  });
  it("with a lock, the second writer waits and then works from the new balance: 100 → 50 → 0", () => {
    const r = playRace(true);
    expect(r.finalBalance).toBe(0);
    expect(r.finalBalance).toBe(r.expected);
    expect(r.steps.map((s) => s.balance)).toEqual([100, 100, 50, 50, 0]);
  });
  it("the lock costs a wait: B stands still for a step and the whole thing takes one step longer", () => {
    const free = playRace(false);
    const locked = playRace(true);
    expect(locked.steps.filter((s) => s.waiting === "B")).toHaveLength(1);
    expect(locked.steps.length).toBe(free.steps.length + 1);
  });
  it("is general over the amounts", () => {
    expect(playRace(false, 80, 30).finalBalance).toBe(50);
    expect(playRace(true, 80, 30).finalBalance).toBe(20);
  });
});
