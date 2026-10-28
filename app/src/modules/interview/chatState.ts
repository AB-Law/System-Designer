import type { StreamEvent, Turn } from "./types";

export interface ChatState {
  turns: Turn[];
  /** the interviewer's reply as it arrives; empty when none is being written */
  streaming: string;
  busy: boolean;
  error: string | null;
  finished: boolean;
  feedbackJobId: string | null;
}

export type ChatAction =
  | { type: "begin"; answer?: Turn }
  | { type: "event"; event: StreamEvent }
  | { type: "fail"; message: string }
  | { type: "sync"; turns: Turn[] };

export const initialChat = (turns: Turn[]): ChatState => ({
  turns,
  streaming: "",
  busy: false,
  error: null,
  finished: false,
  feedbackJobId: null,
});

/** True when the interviewer owes a line: the very first one, or a reply after an answer. */
export const owesReply = (turns: Turn[]): boolean => turns.length === 0 || turns[turns.length - 1].role === "candidate";

function onEvent(state: ChatState, e: StreamEvent): ChatState {
  switch (e.type) {
    case "start":
      return state;
    case "delta":
      return { ...state, streaming: state.streaming + e.text };
    case "done":
      return {
        ...state,
        turns: [...state.turns, e.turn],
        streaming: "",
        busy: false,
        finished: e.finished,
        feedbackJobId: e.feedbackJobId,
      };
    case "error":
      return { ...state, streaming: "", busy: false, error: e.message };
  }
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "begin":
      return { ...state, turns: action.answer ? [...state.turns, action.answer] : state.turns, streaming: "", busy: true, error: null };
    case "event":
      return onEvent(state, action.event);
    case "fail":
      return { ...state, streaming: "", busy: false, error: action.message };
    case "sync":
      return { ...state, turns: action.turns };
  }
}
