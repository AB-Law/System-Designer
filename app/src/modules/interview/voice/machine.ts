import type { VoicePhase } from "./types";

export interface VoiceState {
  phase: VoicePhase;
  error: string | null;
  draftHint: string | null;
}

export type VoiceAction =
  | { type: "start_listen" }
  | { type: "cancel_listen" }
  | { type: "submit"; text: string }
  | { type: "draft"; text: string }
  | { type: "transcribe_fail"; message: string }
  | { type: "chat_busy" }
  | { type: "chat_idle" }
  | { type: "speak" }
  | { type: "spoke" }
  | { type: "barge_in" }
  | { type: "fallback_type" }
  | { type: "clear_error" };

export const initialVoice = (): VoiceState => ({ phase: "idle", error: null, draftHint: null });

/** Pure voice phase machine. Chat busy/idle and TTS are driven from the outside. */
export function voiceReducer(state: VoiceState, action: VoiceAction): VoiceState {
  switch (action.type) {
    case "start_listen":
      return state.phase === "idle" || state.phase === "speaking" ? { phase: "listening", error: null, draftHint: null } : state;
    case "cancel_listen":
      return state.phase === "listening" ? { phase: "idle", error: null, draftHint: null } : state;
    case "submit":
      return state.phase === "listening" || state.phase === "idle" ? { phase: "thinking", error: null, draftHint: action.text } : state;
    case "draft":
      return { phase: "idle", error: null, draftHint: action.text };
    case "transcribe_fail":
      return { phase: "idle", error: action.message, draftHint: null };
    case "chat_busy":
      return state.phase === "idle" || state.phase === "thinking" ? { ...state, phase: "thinking", error: null } : state;
    case "chat_idle":
      return state.phase === "thinking" ? { ...state, phase: "idle" } : state;
    case "speak":
      return state.phase === "thinking" || state.phase === "idle" ? { ...state, phase: "speaking", error: null } : state;
    case "spoke":
      return state.phase === "speaking" ? { ...state, phase: "idle" } : state;
    case "barge_in":
      // Drop to idle so start_listen can open a fresh recorder.
      return state.phase === "speaking" ? { phase: "idle", error: null, draftHint: null } : state;
    case "fallback_type":
      return { phase: "idle", error: state.error, draftHint: null };
    case "clear_error":
      return { ...state, error: null };
  }
}
