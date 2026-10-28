import { describe, expect, it } from "vitest";
import { parseSse } from "./sse";

describe("parseSse", () => {
  it("reads whole events and ignores comments", () => {
    const { events, rest } = parseSse(': open\n\ndata: {"type":"start","tag":"question"}\n\ndata: {"type":"delta","text":"Hi"}\n\n');
    expect(events).toEqual([
      { type: "start", tag: "question" },
      { type: "delta", text: "Hi" },
    ]);
    expect(rest).toBe("");
  });

  it("keeps a partial event for the next chunk", () => {
    const first = parseSse('data: {"type":"delta","text":"Hel"}\n\ndata: {"type":"del');
    expect(first.events).toHaveLength(1);
    const second = parseSse(first.rest + 'ta","text":"lo"}\n\n');
    expect(second.events).toEqual([{ type: "delta", text: "lo" }]);
  });

  it("skips a malformed event", () => {
    const { events } = parseSse('data: {nope\n\ndata: {"type":"error","message":"x"}\n\n');
    expect(events).toEqual([{ type: "error", message: "x" }]);
  });
});
