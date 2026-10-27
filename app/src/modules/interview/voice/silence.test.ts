import { describe, expect, it } from "vitest";
import { rootMeanSquare } from "./silence";

describe("rootMeanSquare", () => {
  it("is zero for silence and positive for a tone", () => {
    expect(rootMeanSquare([0, 0, 0, 0])).toBe(0);
    expect(rootMeanSquare([0.5, -0.5, 0.5, -0.5])).toBeCloseTo(0.5);
  });
});
