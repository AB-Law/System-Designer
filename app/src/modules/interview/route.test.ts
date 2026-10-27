import { describe, expect, it } from "vitest";
import { format, hashFor, parse, tabOf, type InterviewRoute } from "./route";

const routes: InterviewRoute[] = [
  { name: "sessions" },
  { name: "new", roleId: null },
  { name: "new", roleId: 4 },
  { name: "session", sessionId: 12 },
  { name: "docs" },
];

describe("interview routes", () => {
  it("round-trips every route", () => {
    for (const r of routes) expect(parse(format(r))).toEqual(r);
  });

  it("sends unknown or malformed paths to the session list", () => {
    for (const bad of [
      "nope",
      "session",
      "session/x",
      "session/1/extra",
      "new/x",
      "new/1/2",
      "session/-1",
      "session/99999999999",
      "docs/1",
    ]) {
      expect(parse(bad)).toEqual({ name: "sessions" });
    }
  });

  it("builds hashes", () => {
    expect(hashFor({ name: "sessions" })).toBe("#/interview");
    expect(hashFor({ name: "session", sessionId: 3 })).toBe("#/interview/session/3");
    expect(hashFor({ name: "docs" })).toBe("#/interview/docs");
  });

  it("puts routes under a tab", () => {
    expect(tabOf({ name: "new", roleId: 2 })).toBe("new");
    expect(tabOf({ name: "session", sessionId: 2 })).toBe("sessions");
    expect(tabOf({ name: "docs" })).toBe("docs");
  });
});
