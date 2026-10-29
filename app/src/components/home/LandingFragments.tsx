import { useEffect, useState } from "react";
import { reducedMotion, useEased, useInView } from "./motionHooks";

/*
  Small pieces of each module, drawn with the app's own tokens. The figures are sample data. Each one loops quietly while it is on screen
  and shows its finished state, without moving, when the visitor asks for reduced motion. Every root carries data-ui.
*/

/** Steps through 0..count-1, holding the last one longer, then starts again. Parked on the last step under reduced motion. */
function useCycle(count: number, active: boolean, stepMs: number, holdMs: number): number {
  const [i, setI] = useState(() => (reducedMotion() ? count - 1 : 0));
  useEffect(() => {
    if (!active || reducedMotion()) return;
    const t = window.setTimeout(() => setI((v) => (v >= count - 1 ? 0 : v + 1)), i >= count - 1 ? holdMs : stepMs);
    return () => window.clearTimeout(t);
  }, [i, active, count, stepMs, holdMs]);
  return i;
}

const DESIGN_ROWS = [
  { k: "Normal day", score: [92, 92, 92], why: ["Passed", "Passed", "Passed"] },
  { k: "Traffic spike", score: [64, 88, 88], why: ["Database saturates", "Replica added", "Replica added"] },
  { k: "Server failure", score: [41, 41, 80], why: ["No failover", "No failover", "Failover added"] },
];

/** The design improves in front of you: each fix lifts a scenario and the total follows. */
export function DesignFragment() {
  const [ref, inView] = useInView<HTMLElement>();
  const step = useCycle(3, inView, 1700, 3000);
  const total = Math.round(DESIGN_ROWS.reduce((n, r) => n + r.score[step], 0) / DESIGN_ROWS.length);
  const shown = Math.round(useEased(total, 700));
  return (
    <figure className="lf" data-ui ref={ref} aria-label="Sample design score">
      <figcaption>Design a Short Link Service</figcaption>
      <p className="lf-big">
        {shown}
        <small> / 100</small>
      </p>
      <ul>
        {DESIGN_ROWS.map((r) => (
          <li key={r.k}>
            <span>
              {r.k}, {r.score[step]}
            </span>
            <b className={r.why[step] === "Passed" || r.why[step] !== r.why[0] ? "fixed" : ""}>{r.why[step]}</b>
          </li>
        ))}
      </ul>
    </figure>
  );
}

const GAPS: [string, string][] = [
  ["Caching", "Missing"],
  ["Fault tolerance", "Missing"],
  ["Reliable cloud systems", "Weak"],
];

/** Closing the gaps one by one lifts the fit score from 71 to 84. */
export function CvFragment() {
  const [ref, inView] = useInView<HTMLElement>();
  const step = useCycle(4, inView, 1300, 3000);
  const score = Math.round(useEased([71, 76, 81, 84][step], 600));
  return (
    <figure className="lf" data-ui ref={ref} aria-label="Sample CV score">
      <figcaption>Fit to Staff Backend Engineer</figcaption>
      <p className="lf-big">
        {score}
        <small> / 100</small>
      </p>
      <p className="lf-note">{step === 3 ? "Every gap closed" : "Top gaps to close first"}</p>
      <ul>
        {GAPS.map(([k, v], i) => (
          <li key={k}>
            <span>{k}</span>
            <b className={i < step ? "fixed" : ""}>{i < step ? "Covered" : v}</b>
          </li>
        ))}
      </ul>
    </figure>
  );
}

const ANSWER = "Put a cache in front of the database, then add read replicas if the hit ratio is not enough.";

/** The answer types itself out, then the feedback and score land. */
export function InterviewFragment() {
  const [ref, inView] = useInView<HTMLElement>();
  const [n, setN] = useState(() => (reducedMotion() ? ANSWER.length : 0));
  useEffect(() => {
    if (!inView || reducedMotion()) return;
    const t = window.setTimeout(() => setN((v) => (v >= ANSWER.length ? 0 : v + 1)), n >= ANSWER.length ? 4200 : n === 0 ? 700 : 26);
    return () => window.clearTimeout(t);
  }, [n, inView]);
  const done = n >= ANSWER.length;
  const score = Math.round(useEased(done ? 68 : 0, 900));
  return (
    <figure className="lf" data-ui ref={ref} aria-label="Sample mock interview exchange">
      <figcaption>Round 1, friendly interviewer</figcaption>
      <p className="lf-q">How would you scale reads on this service?</p>
      <p className="lf-a">
        {ANSWER.slice(0, n)}
        {!done && <span className="lf-caret" aria-hidden="true" />}
        {/* reserve the full height so the card does not jump while typing */}
        <span className="lf-ghost" aria-hidden="true">
          {ANSWER.slice(n)}
        </span>
      </p>
      <p className={`lf-note lf-fb${done ? " on" : ""}`}>
        <b>Feedback, {score} / 100.</b> Strong on caching. Vague on how stale data is cleared.
      </p>
    </figure>
  );
}

/** A card shows its question, turns over to the answer, then is rated and scheduled. */
export function StudyFragment() {
  const [ref, inView] = useInView<HTMLElement>();
  const step = useCycle(3, inView, 2200, 3200);
  return (
    <figure className="lf" data-ui ref={ref} aria-label="Sample flashcard">
      <figcaption>11 due today, about 4 minutes</figcaption>
      <div className={`lf-flip${step >= 1 ? " turned" : ""}`}>
        <p className="lf-q lf-face">A cache has a hit ratio of 0.9. How many reads still reach the database?</p>
        <p className="lf-a lf-face lf-back">One in ten. The cache absorbs the other nine.</p>
      </div>
      <p className="lf-note">
        {step === 2 ? (
          <>
            <b>Rated Good.</b> Next review in 6 days.
          </>
        ) : step === 1 ? (
          "How well did you know it?"
        ) : (
          "Think of the answer, then turn the card."
        )}
      </p>
    </figure>
  );
}
