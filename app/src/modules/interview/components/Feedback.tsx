import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { ProgressBar } from "../../../ui/ProgressBar";
import { ScoreRing } from "../../../ui/ScoreRing";
import { go } from "../route";
import { CATEGORIES, CATEGORY_LABELS, type AnswerFeedback, type Feedback as FeedbackData, type SessionDetail } from "../types";

function Bullets({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
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

function Summary({ feedback }: { feedback: FeedbackData }) {
  const { summary } = feedback;
  const categories = CATEGORIES.filter((c) => summary.byCategory[c] !== undefined);
  return (
    <div className="iv-summary">
      {summary.score !== null && <ScoreRing value={summary.score} size={96} label="Interview score" />}
      <div className="iv-stack">
        {categories.map((c) => (
          <div key={c} className="iv-bar">
            <span>{CATEGORY_LABELS[c]}</span>
            <ProgressBar value={summary.byCategory[c] ?? 0} label={CATEGORY_LABELS[c]} />
            <b>{summary.byCategory[c]}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Feedback({ detail, feedback }: { detail: SessionDetail; feedback: FeedbackData }) {
  const { summary, perAnswer } = feedback;
  return (
    <div className="iv-stack">
      <Card
        title={`Feedback: ${detail.role.title}`}
        actions={
          <Button size="small" variant="primary" onClick={() => go({ name: "new", roleId: detail.roleId })}>
            Practise again
          </Button>
        }
      >
        {perAnswer.length === 0 ? (
          <p className="iv-hint">You ended the interview before answering a question, so there is nothing to mark.</p>
        ) : (
          <>
            <Summary feedback={feedback} />
            <div className="iv-two">
              <Bullets title="Strengths" items={summary.strengths} />
              <Bullets title="Gaps" items={summary.gaps} />
            </div>
            <Bullets title="Practise next" items={summary.practiceNext} />
          </>
        )}
      </Card>
      {perAnswer.length > 0 && (
        <Card title="Answer by answer">
          {perAnswer.map((a) => (
            <Answer key={a.ref} a={a} />
          ))}
        </Card>
      )}
    </div>
  );
}
