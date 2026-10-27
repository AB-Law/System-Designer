import { describe, expect, it } from "vitest";
import { initialVoice, voiceReducer, type VoiceAction } from "./machine";

function apply(actions: VoiceAction[]) {
  return actions.reduce(voiceReducer, initialVoice());
}

describe("voiceReducer", () => {
  it("starts listening from idle or speaking", () => {
    expect(apply([{ type: "start_listen" }]).phase).toBe("listening");
    expect(apply([{ type: "speak" }, { type: "start_listen" }]).phase).toBe("listening");
  });

  it("ignores start_listen while already listening or thinking", () => {
    expect(apply([{ type: "start_listen" }, { type: "start_listen" }]).phase).toBe("listening");
    expect(apply([{ type: "submit", text: "hi" }, { type: "start_listen" }]).phase).toBe("thinking");
  });

  it("submit from listening goes to thinking with the transcript", () => {
    const s = apply([{ type: "start_listen" }, { type: "submit", text: "hello" }]);
    expect(s).toMatchObject({ phase: "thinking", draftHint: "hello", error: null });
  });

  it("draft returns to idle with the text for the textarea", () => {
    const s = apply([{ type: "start_listen" }, { type: "draft", text: "typed" }]);
    expect(s).toMatchObject({ phase: "idle", draftHint: "typed" });
  });

  it("transcribe_fail clears to idle with an error", () => {
    const s = apply([{ type: "start_listen" }, { type: "transcribe_fail", message: "denied" }]);
    expect(s).toMatchObject({ phase: "idle", error: "denied" });
  });

  it("speak and spoke cycle", () => {
    expect(apply([{ type: "speak" }]).phase).toBe("speaking");
    expect(apply([{ type: "speak" }, { type: "spoke" }]).phase).toBe("idle");
  });

  it("barge_in from speaking returns to idle so listening can restart", () => {
    expect(apply([{ type: "speak" }, { type: "barge_in" }]).phase).toBe("idle");
    expect(apply([{ type: "barge_in" }]).phase).toBe("idle");
    expect(apply([{ type: "speak" }, { type: "barge_in" }, { type: "start_listen" }]).phase).toBe("listening");
  });

  it("chat_busy and chat_idle", () => {
    expect(apply([{ type: "chat_busy" }]).phase).toBe("thinking");
    expect(apply([{ type: "chat_busy" }, { type: "chat_idle" }]).phase).toBe("idle");
  });

  it("cancel_listen only from listening", () => {
    expect(apply([{ type: "start_listen" }, { type: "cancel_listen" }]).phase).toBe("idle");
    expect(apply([{ type: "cancel_listen" }]).phase).toBe("idle");
  });
});
