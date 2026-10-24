import { useId, useState } from "react";
import { CACHE_DEMO, cacheOutcome, loadMultiple } from "./cacheModel";

const n = (x: number) => Math.round(x).toLocaleString("en-GB");
const pct = (x: number) => `${Math.round(x * 100)}%`;

const GUESSES = [
  { id: "half", label: "About half as much" },
  { id: "two", label: "About 2 times as much" },
  { id: "five", label: "About 5 times as much" },
  { id: "ten", label: "About 10 times as much" },
];

/** Predict first, then reveal. Same pattern for every later predict-and-reveal demo. */
export function CacheDemo() {
  const name = useId();
  const sliderId = useId();
  const [guess, setGuess] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [hit, setHit] = useState(CACHE_DEMO.after * 100);

  const before = cacheOutcome(CACHE_DEMO.before);
  const after = cacheOutcome(CACHE_DEMO.after);
  const times = loadMultiple(before, after);
  const tried = cacheOutcome(hit / 100);

  const reset = () => {
    setGuess(null);
    setRevealed(false);
    setHit(CACHE_DEMO.after * 100);
  };

  return (
    <section className="demo" aria-labelledby={`${name}-t`}>
      <header className="demo-head">
        <h3 id={`${name}-t`}>Predict the database load</h3>
        <span className="demo-tag">Teaching model</span>
      </header>

      <p>
        A page gets {n(CACHE_DEMO.readsPerSec)} reads a second. A cache answers the reads it has seen before; the rest go to the database.
        With a hit ratio of {pct(CACHE_DEMO.before)}, the database receives {n(before.dbReadsPerSec)} reads a second.
      </p>

      <fieldset className="demo-q" disabled={revealed}>
        <legend>
          The hit ratio drops to {pct(CACHE_DEMO.after)}. How much read load does the database now receive, compared with before?
        </legend>
        {GUESSES.map((g) => (
          <label key={g.id} className="demo-opt">
            <input type="radio" name={name} value={g.id} checked={guess === g.id} onChange={() => setGuess(g.id)} />
            <span>{g.label}</span>
          </label>
        ))}
      </fieldset>

      {!revealed && (
        <button type="button" className="btn primary" disabled={!guess} onClick={() => setRevealed(true)}>
          Reveal the answer
        </button>
      )}

      <div role="status" aria-live="polite">
        {revealed && (
          <div className="demo-result">
            <p>
              <b>{guess === "five" ? "Yes: about 5 times as much." : "The database receives 5 times as much."}</b> A hit ratio only looks
              like a small change. What matters is the share that misses: it went from {pct(before.missShare)} to {pct(after.missShare)}.
            </p>
            <table className="demo-table">
              <caption>The calculation</caption>
              <thead>
                <tr>
                  <th scope="col">Hit ratio</th>
                  <th scope="col">Misses</th>
                  <th scope="col">Reads reaching the database</th>
                  <th scope="col">Database busy</th>
                </tr>
              </thead>
              <tbody>
                {[before, after].map((o) => (
                  <tr key={o.hitRatio}>
                    <th scope="row">{pct(o.hitRatio)}</th>
                    <td>{pct(o.missShare)}</td>
                    <td>
                      {n(CACHE_DEMO.readsPerSec)} × {o.missShare.toFixed(2)} = {n(o.dbReadsPerSec)} a second
                    </td>
                    <td>
                      {pct(o.dbUtilisation)}
                      {o.overloaded ? " (cannot keep up)" : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p>
              {n(after.dbReadsPerSec)} ÷ {n(before.dbReadsPerSec)} = {times.toFixed(0)}. In this example the database was comfortable at{" "}
              {pct(CACHE_DEMO.before)} and is overloaded at {pct(CACHE_DEMO.after)}.
            </p>

            <div className="demo-try">
              <label htmlFor={sliderId}>
                Try another hit ratio: <b>{Math.round(hit)}%</b>
              </label>
              <input
                id={sliderId}
                type="range"
                min={0}
                max={98}
                step={1}
                value={hit}
                onChange={(e) => setHit(Number(e.target.value))}
                aria-valuetext={`${Math.round(hit)} percent hit ratio`}
              />
              <p aria-live="polite">
                At {pct(tried.hitRatio)} the database receives {n(tried.dbReadsPerSec)} reads a second and is {pct(tried.dbUtilisation)}{" "}
                busy
                {tried.overloaded ? ", more than it can answer." : "."}
              </p>
            </div>
            <button type="button" className="btn small" onClick={reset}>
              Try the question again
            </button>
          </div>
        )}
      </div>

      <details className="demo-assume" open>
        <summary>Assumptions and limits</summary>
        <ul>
          <li>This is a teaching model, not a measurement. The numbers are invented for the lesson.</li>
          <li>
            All {n(CACHE_DEMO.readsPerSec)} requests are reads. A write always reaches the database, so with writes the change would be
            smaller than 5 times.
          </li>
          <li>The database is assumed to answer {n(CACHE_DEMO.dbReadsPerSec)} reads a second.</li>
          <li>The hit ratio is a number you choose. A real workload decides its own, and it can change when the traffic changes.</li>
          <li>The model has no keys, expiry, invalidation or hot items. The Design Canvas cache block makes the same simplification.</li>
          <li>The app caps the hit ratio at 98%.</li>
        </ul>
      </details>
    </section>
  );
}
