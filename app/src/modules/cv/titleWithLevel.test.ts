import { describe, expect, it } from "vitest";
import { titleWithLevel } from "./components/ScoreForm";

describe("titleWithLevel", () => {
  it("puts the target's level in front of its title", () => {
    expect(titleWithLevel("Backend Engineer", "Staff")).toBe("Staff Backend Engineer");
  });
  it("leaves a title that already names its level, or has no level, alone", () => {
    expect(titleWithLevel("Staff Backend Engineer", "Staff")).toBe("Staff Backend Engineer");
    expect(titleWithLevel("Backend Engineer", "")).toBe("Backend Engineer");
  });
});
