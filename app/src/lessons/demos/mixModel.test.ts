import { describe, expect, it } from "vitest";
import { MIX_DEMO, mixOutcome } from "./mixModel";

/*
  Hand calculation. The store answers 2,000 reads a second and 400 writes a second. The most requests a second it can take at a
  write share w is 1 / ((1 - w) / 2000 + w / 400).
    recipe site, w = 3%:  1 / (0.97 / 2000 + 0.03 / 400) = 1 / (0.000485 + 0.000075) = 1 / 0.00056   = 1,785.7
    ferry page,  w = 50%: 1 / (0.50 / 2000 + 0.50 / 400) = 1 / (0.00025  + 0.00125)  = 1 / 0.0015    =   666.7
*/
describe("read/write mix teaching model", () => {
  it("has the limits the lesson quotes", () => {
    const o = mixOutcome(0.03);
    expect(o.readLimit).toBeCloseTo(2000, 6);
    expect(o.writeLimit).toBeCloseTo(400, 6);
  });
  it("matches the hand calculation for the recipe site", () => {
    const o = mixOutcome(MIX_DEMO.recipeWriteShare);
    expect(o.reads).toBeCloseTo(970, 6);
    expect(o.writes).toBeCloseTo(30, 6);
    expect(o.maxTotal).toBeCloseTo(1785.7143, 3);
    expect(o.limitedBy).toBe("none");
  });
  it("matches the hand calculation for the ferry page: the write limit is passed even though reads are fine", () => {
    const o = mixOutcome(MIX_DEMO.ferryWriteShare);
    expect(o.reads).toBeCloseTo(500, 6);
    expect(o.writes).toBeCloseTo(500, 6);
    expect(o.maxTotal).toBeCloseTo(666.6667, 3);
    expect(o.limitedBy).toBe("writes"); // 500 writes against a limit of 400; 500 reads are well inside 2,000
  });
  it("only reads: the read limit is the ceiling", () => {
    expect(mixOutcome(0).maxTotal).toBeCloseTo(2000, 6);
    expect(mixOutcome(0, 2500).limitedBy).toBe("reads");
  });
  it("only writes: the write limit is the ceiling", () => {
    expect(mixOutcome(1).maxTotal).toBeCloseTo(400, 6);
  });
});
