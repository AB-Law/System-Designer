import { useState } from "react";
import { useAction } from "../../../shared/async";
import { featureOn } from "../../../shell/registry";
import { Card } from "../../../ui/Card";
import { CountUp } from "../../../ui/CountUp";
import { interviewApi } from "../api";
import { focusStyle, headline, rankedCategories, SCORE_WORD } from "../debrief";
import { go } from "../route";
import { CATEGORY_LABELS, type AnswerFeedback, type Feedback as FeedbackData, type SessionDetail } from "../types";

function Bullets({ title, items, className = "" }: { title: string; items: string[]; className?: string }) {
  if (!items.length) return null;
  return (
    <div className={className}>
      <h4>{title}</h4>
      <ul>
        {items.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </div>
  );
}

function Answer({ a }: { a: AnswerFeedback }) {
  return (
    <details className="iv-answer">
      <summary>
        <span className="iv-answer-score">{a.score}/5</span>
        <span>
          <small>{CATEGORY_LABELS[a.category]}</small>
          {a.question}
          {a.jdLink && <em className="iv-jd-tag">From the job: {a.jdLink}</em>}
        </span>
      </summary>
      <blockquote>{a.answer}</blockquote>
      {a.jdFit && (
        <p className="iv-jd-fit">
          <strong>Against the job description:</strong> {a.jdFit}
        </p>
      )}
      <div className="iv-two">
        <Bullets title="What worked" items={a.strengths} />
        <Bullets title="What to improve" items={a.gaps} />
      </div>
      {a.better && (
        <>
          <h4>A stronger answer</h4>
          <p>{a.better}</p>
        </>
      )}
      <details>
        <summary>How this was marked</summary>
        <ul>
          {a.rubric.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </details>
    </details>
  );
}

const tone = (score: number): string => (score >= 75 ? "good" : score >= 50 ? "mid" : "low");

/**
 * The debrief: the score and one sentence about it, the two things worth doing next (turn the gaps into flashcards, run a short round on
 * the weakest area), and the areas as a row of figures.
 */
function Debrief({ detail, feedback }: { detail: SessionDetail; feedback: FeedbackData }) {
  const { summary } = feedback;
  const ranked = rankedCategories(summary);
  const weakest = ranked.length > 1 ? ranked[0] : null;
  const { busy, run } = useAction();
  const [error, setError] = useState<string | null>(null);
  const studyOn = featureOn("study");

  const makeCards = () =>
    run(async () => {
      setError(null);
      try {
        const { studyApi } = await import("../../study/api");
        const deck = await studyApi.generateDeck({
          sourceKind: "interview_weakness",
          sourceRef: "all",
          name: `${detail.role.title}: interview gaps`,
        });
        window.location.hash = `#/study/deck/${deck.id}`;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not make the flashcards.");
      }
    });

  const practiseWeakest = () =>
    run(async () => {
      if (!weakest) return;
      setError(null);
      try {
        const session = await interviewApi.startSession(detail.roleId, focusStyle(detail.style, weakest.id));
        go({ name: "session", sessionId: session.id });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not start the round.");
      }
    });

  return (
    <section className="dbf" aria-label="How it went">
      <div className={`dbf-score ${summary.score !== null ? tone(summary.score) : ""}`}>
        <b>{summary.score !== null ? <CountUp value={String(summary.score)} ms={1200} /> : "–"}</b>
        {summary.score !== null && (
          <span>
            out of 100
            <em>{SCORE_WORD(summary.score)}</em>
          </span>
        )}
      </div>
      <div className="dbf-text">
        <h2 className="dbf-line">{headline(summary)}</h2>
        <div className="dbf-cta">
          {studyOn && (
            <button type="button" className="btn primary lg" disabled={busy} onClick={() => void makeCards()}>
              {busy ? "Working…" : "Make flashcards from the gaps"}
            </button>
          )}
          {weakest && (
            <button type="button" className="btn lg" disabled={busy} onClick={() => void practiseWeakest()}>
              Practise {weakest.label.toLowerCase()} for 15 minutes
            </button>
          )}
          <button type="button" className="dbf-link" onClick={() => go({ name: "new", roleId: detail.roleId })}>
            Run the whole interview again
          </button>
        </div>
        {error && (
          <p className="iv-warn" role="alert">
            {error}
          </p>
        )}
      </div>
      {ranked.length > 0 && (
        <ul className="dbf-cats">
          {[...ranked].reverse().map((c) => (
            <li key={c.id} className={tone(c.score) + (weakest?.id === c.id ? " weakest" : "")}>
              <span>{c.label}</span>
              <b>{c.score}</b>
              <i aria-hidden="true">
                <i style={{ width: `${Math.min(100, Math.max(0, c.score))}%` }} />
              </i>
              {weakest?.id === c.id && <em>Weakest</em>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function Feedback({ detail, feedback }: { detail: SessionDetail; feedback: FeedbackData }) {
  const { summary, perAnswer } = feedback;
  if (perAnswer.length === 0) {
    return (
      <Card title={`Feedback: ${detail.role.title}`}>
        <p className="iv-hint">You ended the interview before answering a question, so there is nothing to mark.</p>
        <button type="button" className="btn primary" onClick={() => go({ name: "new", roleId: detail.roleId })}>
          Practise again
        </button>
      </Card>
    );
  }
  return (
    <div className="iv-stack dbf-page">
      <Debrief detail={detail} feedback={feedback} />
      <div className="dbf-cols">
        <Bullets title="What worked" items={summary.strengths} className="dbf-panel" />
        <Bullets title="What held you back" items={summary.gaps} className="dbf-panel" />
      </div>
      <Bullets title="Practise next" items={summary.practiceNext} className="dbf-panel dbf-next" />
      <Card title="Answer by answer">
        {perAnswer.map((a) => (
          <Answer key={a.ref} a={a} />
        ))}
      </Card>
    </div>
  );
}
