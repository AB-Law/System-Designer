import { useCallback, useEffect, useReducer, useRef } from "react";
import { errText } from "../../shared/async";
import { streamTurn } from "./api";
import { chatReducer, initialChat, owesReply } from "./chatState";
import type { Turn } from "./types";

/**
 * The live conversation. It asks for the interviewer's opening on its own, and for a reply that is still owed
 * after a reload or a dropped connection; after that the candidate drives it with `answer`.
 */
export function useChat(sessionId: number, initial: Turn[]) {
  const [state, dispatch] = useReducer(chatReducer, initial, initialChat);
  const asked = useRef(false);

  const request = useCallback(
    async (text: string | null) => {
      const answer: Turn | undefined = text === null ? undefined : { idx: -1, role: "candidate", tag: "answer", text, created: Date.now() };
      dispatch({ type: "begin", answer });
      try {
        await streamTurn(sessionId, text, (event) => dispatch({ type: "event", event }));
      } catch (e) {
        dispatch({ type: "fail", message: errText(e) });
      }
    },
    [sessionId],
  );

  useEffect(() => {
    if (asked.current || !owesReply(initial)) return;
    asked.current = true; // a strict-mode remount must not ask twice
    void request(null);
  }, [initial, request]);

  const answer = useCallback((text: string) => request(text), [request]);
  const retry = useCallback(() => request(null), [request]);
  return { state, answer, retry };
}
