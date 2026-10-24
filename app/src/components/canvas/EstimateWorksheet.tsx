import { useState } from "react";
import { lsGet, lsSet } from "../../api";
import { estimateQuestions, gradeEstimate, parseAmount } from "../../sim/estimate";
import type { Problem } from "../../types";

/** Optional back-of-envelope sizing before building: the learner guesses, then sees how the numbers work out. */
export function EstimateWorksheet({ problem }: { problem: Problem }) {
  const key = `dc:est:${problem.id}`;
  const questions = estimateQuestions(problem);
  const [open, setOpen] = useState(false);
  const [guesses, setGuesses] = useState<Record<string, string>>(() => lsGet<Record<string, string>>(key, {}));
  const [checked, setChecked] = useState(false);

  const set = (id: string, v: string) => {
    const next = { ...guesses, [id]: v };
    setGuesses(next);
    setChecked(false);
    lsSet(key, next);
  };
  const answered = questions.filter((q) => parseAmount(guesses[q.id] ?? "") !== null).length;

  return (
    <div className="est">
      <button className="link" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? "Hide the sizing warm-up" : "Warm up: estimate the load first (optional)"}
      </button>
      {open && (
        <div className="est-body">
          <p className="muted">
            Interviewers start here. Work out roughly how much traffic there will be, then check yourself. Round numbers are fine; "4k"
            works.
          </p>
          {questions.map((q) => {
            const g = parseAmount(guesses[q.id] ?? "");
            const grade = checked && g !== null ? gradeEstimate(g, q.answer) : null;
            return (
              <div className="est-q" key={q.id}>
                <label htmlFor={`est-${q.id}`}>{q.prompt}</label>
                <div className="est-in">
                  <input
                    id={`est-${q.id}`}
                    inputMode="decimal"
                    placeholder="your guess"
                    value={guesses[q.id] ?? ""}
                    onChange={(e) => set(q.id, e.target.value)}
                  />
                  <span>{q.unit}</span>
                </div>
                {checked && (
                  <div className={"est-r " + (grade?.level ?? "skip")}>
                    {grade ? <b>{grade.text}</b> : <b>Not answered.</b>} <span>{q.working}</span>
                  </div>
                )}
              </div>
            );
          })}
          <button className="btn small" disabled={answered === 0} onClick={() => setChecked(true)}>
            Check my estimates
          </button>
        </div>
      )}
    </div>
  );
}
