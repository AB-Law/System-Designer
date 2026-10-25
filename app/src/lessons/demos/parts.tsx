import { useEffect, useId, useRef, type ReactNode } from "react";

const MODEL_LABEL = { teaching: "Teaching model", analyze: "Uses the app's simulator" } as const;

/**
 * The frame every demo sits in: a title, a label saying which kind of model it uses, and the assumptions and limits, open by
 * default. A new demo supplies those three things and its own content.
 */
export function DemoFrame({
  title,
  model,
  assumptions,
  children,
}: {
  title: string;
  model: keyof typeof MODEL_LABEL;
  assumptions: string[];
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section className="demo" aria-labelledby={id}>
      <header className="demo-head">
        <h3 id={id}>{title}</h3>
        <span className="demo-tag">{MODEL_LABEL[model]}</span>
      </header>
      {children}
      <details className="demo-assume" open>
        <summary>Assumptions and limits</summary>
        <ul>
          {assumptions.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}

/** The prediction step: a question with one answer to pick, and a button that stays off until the learner has picked. */
export function Predict({
  question,
  options,
  guess,
  onGuess,
  revealed,
  onReveal,
}: {
  question: string;
  options: { id: string; label: string }[];
  guess: string | null;
  onGuess: (id: string) => void;
  revealed: boolean;
  onReveal: () => void;
}) {
  const name = useId();
  return (
    <>
      <fieldset className="demo-q" disabled={revealed}>
        <legend>{question}</legend>
        {options.map((o) => (
          <label key={o.id} className="demo-opt">
            <input type="radio" name={name} value={o.id} checked={guess === o.id} onChange={() => onGuess(o.id)} />
            <span>{o.label}</span>
          </label>
        ))}
      </fieldset>
      {!revealed && (
        <button type="button" className="btn primary" disabled={!guess} onClick={onReveal}>
          Reveal the answer
        </button>
      )}
    </>
  );
}

/** A labelled range input. The current value is in the label and in `aria-valuetext`, so it is read out as well as seen. */
export function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  text,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  /** the value as words, such as "120 requests a second" */
  text: string;
}) {
  const id = useId();
  return (
    <div className="demo-try">
      <label htmlFor={id}>
        {label}: <b>{text}</b>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-valuetext={text}
      />
    </div>
  );
}

/**
 * The block that appears when a prediction is revealed. It takes keyboard focus as it appears, so a keyboard user (and a screen
 * reader) lands on the answer instead of being dropped back at the top of the page when the Reveal button goes away.
 */
export function Result({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div className="demo-result" ref={ref} tabIndex={-1}>
      {children}
    </div>
  );
}
