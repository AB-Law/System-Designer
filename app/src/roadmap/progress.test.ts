import { describe, expect, it } from "vitest";
import type { Submission } from "../types";
import { bestScore, isStepDone, statusFor } from "./progress";

const sub = (partial: Partial<Submission>): Submission =>
  ({
    at: 1,
    score: 80,
    passed: 3,
    total: 3,
    result: {} as Submission["result"],
    ...partial,
  }) as Submission;

describe("isStepDone", () => {
  it("requires every scenario passed and score at least 80", () => {
    expect(isStepDone([sub({ passed: 3, total: 3, score: 80 })])).toBe(true);
    expect(isStepDone([sub({ passed: 2, total: 3, score: 90 })])).toBe(false);
    expect(isStepDone([sub({ passed: 3, total: 3, score: 79 })])).toBe(false);
    expect(isStepDone([])).toBe(false);
  });
});

describe("bestScore", () => {
  it("returns null for no submissions and the max otherwise", () => {
    expect(bestScore([])).toBeNull();
    expect(bestScore([sub({ score: 40 }), sub({ score: 91 })])).toBe(91);
  });
});

describe("statusFor", () => {
  it("marks done when a qualifying submission exists", () => {
    expect(statusFor("pastebin", "url_shortener", [sub({ score: 85, passed: 3, total: 3 })])).toBe("done");
  });

  it("marks next when this problem is the continue target and nothing started", () => {
    expect(statusFor("pastebin", "pastebin", [])).toBe("next");
  });

  it("marks not_started when neither done nor next", () => {
    expect(statusFor("pastebin", "url_shortener", [])).toBe("not_started");
  });
});
