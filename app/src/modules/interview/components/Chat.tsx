import { useEffect, useRef, useState } from "react";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { TAG_LABELS } from "../format";
import type { SessionDetail, Turn } from "../types";
import { useChat } from "../useChat";
import { Timer } from "./Timer";

function Bubble({ turn }: { turn: Turn }) {
  const mine = turn.role === "candidate";
  return (
    <li className={"iv-turn " + (mine ? "mine" : "theirs")}>
      <small>{mine ? "You" : TAG_LABELS[turn.tag]}</small>
      <p>{turn.text}</p>
    </li>
  );
}

function Plan({ plan }: { plan: NonNullable<SessionDetail["plan"]> }) {
  return (
    <details className="iv-plan">
      <summary>Planned questions ({plan.length})</summary>
      <ol>
        {plan.map((p) => (
          <li key={p.question}>{p.question}</li>
        ))}
      </ol>
    </details>
  );
}

interface Props {
  detail: SessionDetail;
  onEnd: () => void;
  onFinished: () => void;
}

export function Chat({ detail, onEnd, onFinished }: Props) {
  const { state, answer, retry } = useChat(detail.id, detail.turns);
  const [draft, setDraft] = useState("");
  const [skew] = useState(() => detail.serverNow - Date.now()); // how far the server clock is ahead, fixed when the page loaded
  const endRef = useRef<HTMLDivElement>(null);
  const startedAt = state.turns[0]?.created ?? detail.startedAt;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [state.turns.length, state.streaming]);
  useEffect(() => {
    if (state.finished) onFinished();
  }, [state.finished, onFinished]);

  const send = () => {
    const text = draft.trim();
    if (!text || state.busy) return;
    setDraft("");
    void answer(text);
  };
  const canAnswer = !state.busy && !state.finished && state.turns.length > 0 && state.turns[state.turns.length - 1].role === "interviewer";

  return (
    <Card
      title={`${detail.role.title}${detail.role.company ? ` at ${detail.role.company}` : ""}`}
      actions={
        <>
          <Timer startedAt={startedAt} durationMin={detail.style.durationMin} skew={skew} />
          <Button size="small" variant="ghost" onClick={onEnd}>
            End interview
          </Button>
        </>
      }
    >
      {detail.plan && <Plan plan={detail.plan} />}
      <ul className="iv-transcript" aria-live="polite">
        {state.turns.map((t, i) => (
          <Bubble key={i} turn={t} />
        ))}
        {state.busy && (
          <li className="iv-turn theirs">
            <small>Interviewer</small>
            <p>{state.streaming || "…"}</p>
          </li>
        )}
      </ul>
      <div ref={endRef} />
      {state.error && (
        <p className="iv-warn" role="alert">
          {state.error}{" "}
          {state.turns.length > 0 && state.turns[state.turns.length - 1].role === "candidate" && (
            <Button size="small" onClick={() => void retry()}>
              Try again
            </Button>
          )}
        </p>
      )}
      <form
        className="iv-compose"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <textarea
          rows={4}
          value={draft}
          disabled={!canAnswer}
          maxLength={8000}
          placeholder={state.finished ? "The interview is over." : "Type your answer. Ctrl+Enter sends."}
          aria-label="Your answer"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) send();
          }}
        />
        <Button type="submit" variant="primary" disabled={!canAnswer || !draft.trim()}>
          Send
        </Button>
      </form>
    </Card>
  );
}
