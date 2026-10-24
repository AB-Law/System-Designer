import { useId, useState } from "react";
import type { LessonBlock } from "../../lessons/types";
import { GlossText } from "../roadmap/GlossText";

type QuizBlock = Extract<LessonBlock, { kind: "quiz" }>;

/** One question, one correct answer. The result is written in words, so it does not depend on colour. */
export function Quiz({ block }: { block: QuizBlock }) {
  const name = useId();
  const [picked, setPicked] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const right = block.options.findIndex((o) => o.correct);
  const correct = checked && picked === right;

  return (
    <section className="quiz" aria-label="Quick check">
      <fieldset disabled={correct}>
        <legend>
          <GlossText text={block.question} />
        </legend>
        {block.options.map((o, i) => (
          <label key={i} className="demo-opt">
            <input
              type="radio"
              name={name}
              checked={picked === i}
              onChange={() => {
                setPicked(i);
                setChecked(false);
              }}
            />
            <span>
              <GlossText text={o.text} />
            </span>
          </label>
        ))}
      </fieldset>
      {!correct && (
        <button type="button" className="btn" disabled={picked === null} onClick={() => setChecked(true)}>
          Check my answer
        </button>
      )}
      <div role="status" aria-live="polite" className="quiz-result">
        {checked && (
          <p>
            <b>{correct ? "Correct." : "Not quite. Have another look and try again."}</b>{" "}
            {correct && <GlossText text={block.explanation} />}
          </p>
        )}
      </div>
    </section>
  );
}
