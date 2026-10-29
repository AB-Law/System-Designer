import { describe, expect, it } from "vitest";
import { BREAK_END, FIX_AT, INCIDENT, PEAK_RPS, SPIKE_RPS, sceneFrame, sceneRps, sceneState, servedPercent } from "./landingModel";

describe("servedPercent", () => {
  it("is 100 while the servers can keep up and falls with each server lost", () => {
    expect(servedPercent(3, 900)).toBe(100);
    expect(servedPercent(3, SPIKE_RPS)).toBe(100);
    expect(servedPercent(2, SPIKE_RPS)).toBe(67);
    expect(servedPercent(1, SPIKE_RPS)).toBe(33);
    expect(servedPercent(0, SPIKE_RPS)).toBe(0);
  });
});

describe("INCIDENT", () => {
  it("runs in time order, ends with every server up and hands over to the visitor", () => {
    const times = INCIDENT.map((s) => s.at);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    const last = INCIDENT[INCIDENT.length - 1];
    expect(last.down).toBeUndefined();
    expect(INCIDENT.filter((s) => s.down).pop()?.down).toEqual([]);
  });
});

describe("sceneRps", () => {
  it("scrubs from 100 to 1,000,000 on a log scale", () => {
    expect(sceneRps(0)).toBe(100);
    expect(sceneRps(0.5)).toBe(10_000);
    expect(sceneRps(1)).toBe(1_000_000);
    expect(sceneRps(2)).toBe(1_000_000);
    expect(sceneRps(-1)).toBe(100);
  });
});

describe("sceneState without fixes", () => {
  it("fails the cache, then the servers, then the database, then the queue, in that order", () => {
    const order = [20_000, 80_000, 200_000, 600_000].map((r) => sceneState(r).failing);
    expect(order).toEqual(["cache", "servers", "database", "queue"]);
  });
  it("starts healthy and serves less and less as load grows", () => {
    expect(sceneState(100).failing).toBeNull();
    let prev = 100;
    for (let p = 0; p <= 1; p += 0.05) {
      const s = sceneState(sceneRps(p)).served;
      expect(s).toBeLessThanOrEqual(prev);
      prev = s;
    }
    expect(sceneState(PEAK_RPS).served).toBe(15);
  });
});

describe("sceneFrame", () => {
  it("breaks things as load climbs, then recovers at the peak as each fix lands", () => {
    const broken = sceneFrame(BREAK_END);
    expect(broken.rps).toBe(PEAK_RPS);
    expect(broken.fixes).toBe(0);
    expect(broken.served).toBe(15);
    expect([broken.cache, broken.servers, broken.db, broken.queue]).toEqual(["bad", "bad", "bad", "bad"]);

    let prev = broken.served;
    FIX_AT.forEach((at, i) => {
      const s = sceneFrame(at);
      expect(s.rps).toBe(PEAK_RPS);
      expect(s.fixes).toBe(i + 1);
      expect(s.served).toBeGreaterThan(prev);
      prev = s.served;
    });
  });
  it("ends fully healthy: every part ok, an empty queue, nearly everything answered", () => {
    const end = sceneFrame(1);
    expect(end.fixes).toBe(4);
    expect([end.cache, end.servers, end.db, end.queue]).toEqual(["ok", "ok", "ok", "ok"]);
    expect(end.backlog).toBe(0);
    expect(end.served).toBe(99);
    expect(end.failing).toBeNull();
  });
  it("clamps scroll positions outside 0..1", () => {
    expect(sceneFrame(-3).rps).toBe(100);
    expect(sceneFrame(4).fixes).toBe(4);
  });
});
