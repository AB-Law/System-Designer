import { describe, expect, it } from "vitest";
import { format, parse, tabOf } from "./route";

describe("study routes", () => {
  it("round-trips known paths", () => {
    const cases = [
      { rest: "", route: { name: "decks" as const } },
      { rest: "due", route: { name: "due" as const } },
      { rest: "deck/12", route: { name: "deck" as const, deckId: 12 } },
      { rest: "review", route: { name: "review" as const, deckId: null } },
      { rest: "review/3", route: { name: "review" as const, deckId: 3 } },
      { rest: "maps", route: { name: "maps" as const } },
      { rest: "map/9", route: { name: "map" as const, mapId: 9 } },
    ];
    for (const c of cases) {
      expect(parse(c.rest)).toEqual(c.route);
      expect(format(c.route)).toBe(c.rest);
    }
  });

  it("falls back on junk", () => {
    expect(parse("nope/x")).toEqual({ name: "decks" });
  });

  it("maps tabs", () => {
    expect(tabOf({ name: "decks" })).toBe("decks");
    expect(tabOf({ name: "deck", deckId: 1 })).toBe("decks");
    expect(tabOf({ name: "due" })).toBe("due");
    expect(tabOf({ name: "review", deckId: null })).toBe("due");
    expect(tabOf({ name: "maps" })).toBe("maps");
    expect(tabOf({ name: "map", mapId: 1 })).toBe("maps");
  });
});
