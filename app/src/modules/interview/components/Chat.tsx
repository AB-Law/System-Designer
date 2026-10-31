import { useEffect, useRef, useState } from "react";
import { featureOn } from "../../../shell/registry";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { TAG_LABELS } from "../format";
import type { SessionDetail, Turn } from "../types";
import { scrollToEnd } from "../scroll";
import { useChat } from "../useChat";
import { VoiceControls } from "../voice/VoiceControls";
import { VoiceSettings } from "../voice/VoiceSettings";
import { useVoice } from "../voice/useVoice";
import { Budget } from "./Budget";
import { Timer } from "./Timer";

const VOICE = "interview.voice";

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
          <li key={p.question}>
            {p.question}
            {p.jd_link && <em className="iv-jd-tag">From the job: {p.jd_link}</em>}
          </li>
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
  const [skew] = useState(() => detail.serverNow - Date.now());
  const transcriptRef = useRef<HTMLUListElement>(null);
  const startedAt = state.turns[0]?.created ?? detail.startedAt;
  const voiceOn = featureOn(VOICE);
  const asked = state.turns.filter((t) => t.role === "interviewer").length;
  const answered = state.turns.filter((t) => t.role === "candidate").length;
  const planned = detail.plan?.length ?? 0;

  const canAnswer = !state.busy && !state.finished && state.turns.length > 0 && state.turns[state.turns.length - 1].role === "interviewer";
  const lastInterviewer = [...state.turns].reverse().find((t) => t.role === "interviewer")?.text ?? "";

  const voice = useVoice({
    enabled: voiceOn,
    sessionId: detail.id,
    chat: {
      busy: state.busy,
      finished: state.finished,
      canAnswer,
      lastInterviewerText: lastInterviewer,
      streaming: state.streaming,
    },
    answer,
    onDraft: setDraft,
  });

  // The transcript is its own scroll area, so scroll it rather than the page.
  useEffect(() => {
    scrollToEnd(transcriptRef.current);
  }, [state.turns.length, state.streaming, state.busy]);

  const send = () => {
    const text = draft.trim();
    if (!text || state.busy) return;
    setDraft("");
    void answer(text);
  };

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
      {asked > 0 && (
        <div className="iv-progress">
          <span>{planned ? `Question ${Math.min(asked, planned)} of ${planned}` : `Question ${asked}`}</span>
          {planned > 0 && (
            <i aria-hidden="true">
              <i style={{ width: `${Math.min(100, (answered / planned) * 100)}%` }} />
            </i>
          )}
        </div>
      )}
      {detail.plan && <Plan plan={detail.plan} />}
      <ul className="iv-transcript" aria-live="polite" ref={transcriptRef}>
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
      {state.finished && (
        <p className="iv-hint">
          That's the end of the interview.{" "}
          <Button size="small" variant="primary" onClick={onFinished}>
            See my feedback
          </Button>
        </p>
      )}
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
      {voiceOn && (
        <>
          {!voice.capability.ok && voice.capability.message && <p className="iv-hint">{voice.capability.message}</p>}
          <VoiceControls
            phase={voice.state.phase}
            canAnswer={canAnswer}
            micOk={voice.capability.ok}
            error={voice.state.error}
            handsFree={voice.prefs.handsFree}
            onStart={() => void voice.startListening()}
            onStop={() => voice.stopListening()}
            onTypeInstead={() => voice.typeInstead()}
            onClearError={voice.clearError}
          />
          <VoiceSettings prefs={voice.prefs} onChange={voice.setPrefs} speechSynthesis={voice.capability.speechSynthesis} />
        </>
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
          placeholder={
            state.finished
              ? "The interview is over."
              : voiceOn
                ? "Type or use the mic. Ctrl+Enter sends."
                : "Type your answer. Ctrl+Enter sends."
          }
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
      <Budget />
    </Card>
  );
}
