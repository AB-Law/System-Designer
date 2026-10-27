import { describe, expect, it } from "vitest";
import { chatReducer, initialChat, owesReply } from "./chatState";
import type { Turn } from "./types";

const turn = (idx: number, role: Turn["role"], text = "x"): Turn => ({
  idx,
  role,
  tag: role === "candidate" ? "answer" : "question",
  text,
  created: idx,
});

describe("chat state", () => {
  it("owes a reply at the start and after an answer, not after a question", () => {
    expect(owesReply([])).toBe(true);
    expect(owesReply([turn(0, "interviewer")])).toBe(false);
    expect(owesReply([turn(0, "interviewer"), turn(1, "candidate")])).toBe(true);
  });

  it("shows the answer at once, grows the reply, then stores it", () => {
    let s = initialChat([turn(0, "interviewer")]);
    s = chatReducer(s, { type: "begin", answer: turn(1, "candidate", "my answer") });
    expect(s.busy).toBe(true);
    expect(s.turns).toHaveLength(2);
    s = chatReducer(s, { type: "event", event: { type: "delta", text: "Thanks, " } });
    s = chatReducer(s, { type: "event", event: { type: "delta", text: "next." } });
    expect(s.streaming).toBe("Thanks, next.");
    s = chatReducer(s, {
      type: "event",
      event: { type: "done", turn: turn(2, "interviewer", "Thanks, next."), finished: false, feedbackJobId: null },
    });
    expect(s).toMatchObject({ busy: false, streaming: "", finished: false });
    expect(s.turns.map((t) => t.idx)).toEqual([0, 1, 2]);
  });

  it("records the end of the interview and its feedback job", () => {
    const s = chatReducer(initialChat([]), {
      type: "event",
      event: { type: "done", turn: turn(0, "interviewer"), finished: true, feedbackJobId: "job1" },
    });
    expect(s).toMatchObject({ finished: true, feedbackJobId: "job1" });
  });

  it("keeps the answer on a stream error and clears the half-written reply", () => {
    let s = chatReducer(initialChat([turn(0, "interviewer")]), { type: "begin", answer: turn(1, "candidate") });
    s = chatReducer(s, { type: "event", event: { type: "delta", text: "Tha" } });
    s = chatReducer(s, { type: "event", event: { type: "error", message: "model down" } });
    expect(s).toMatchObject({ busy: false, streaming: "", error: "model down" });
    expect(s.turns).toHaveLength(2);
    expect(chatReducer(s, { type: "begin" }).error).toBeNull();
  });

  it("resyncs turns from the server", () => {
    const s = chatReducer(initialChat([turn(0, "interviewer"), turn(1, "candidate")]), { type: "sync", turns: [turn(0, "interviewer")] });
    expect(s.turns).toHaveLength(1);
  });
});
