import { useState } from "react";
import { CACHE_DEMO, cacheOutcome, loadMultiple } from "./cacheModel";
import { DemoFrame, Predict, Result, Slider } from "./parts";
import { restart } from "./restart";
import { n, pct } from "./format";

const GUESSES = [
  { id: "half", label: "About half as much" },
  { id: "two", label: "About 2 times as much" },
  { id: "five", label: "About 5 times as much" },
  { id: "ten", label: "About 10 times as much" },
];

export function CacheDemo() {
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
    <DemoFrame
      title="Predict the database load"
      model="teaching"
      assumptions={[
        "This is a teaching model, not a measurement. The numbers are invented for the lesson.",
        `All ${n(CACHE_DEMO.readsPerSec)} requests are reads. A write always reaches the database, so with writes the change would be smaller than 5 times.`,
        `The database is assumed to answer ${n(CACHE_DEMO.dbReadsPerSec)} reads a second.`,
        "The hit ratio is a number you choose. A real workload decides its own, and it can change when the traffic changes.",
        "The model has no keys, expiry, invalidation or hot items. The Design Canvas cache block makes the same simplification.",
        "The app caps the hit ratio at 98%.",
      ]}
    >
      <p>
        A page gets {n(CACHE_DEMO.readsPerSec)} reads a second. A cache answers the reads it has seen before; the rest go to the database.
        With a hit ratio of {pct(CACHE_DEMO.before)}, the database receives {n(before.dbReadsPerSec)} reads a second.
      </p>
      <Predict
        question={`The hit ratio drops to ${pct(CACHE_DEMO.after)}. How much read load does the database now receive, compared with before?`}
        options={GUESSES}
        guess={guess}
        onGuess={setGuess}
        revealed={revealed}
        onReveal={() => setRevealed(true)}
      />
      <div role="status" aria-live="polite">
        {revealed && (
          <Result>
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
            <Slider label="Try another hit ratio" value={hit} min={0} max={98} step={1} onChange={setHit} text={`${Math.round(hit)}%`} />
            <p aria-live="polite">
              At {pct(tried.hitRatio)} the database receives {n(tried.dbReadsPerSec)} reads a second and is {pct(tried.dbUtilisation)} busy
              {tried.overloaded ? ", more than it can answer." : "."}
            </p>
            <button type="button" className="btn small" onClick={(e) => restart(e, reset)}>
              Try the question again
            </button>
          </Result>
        )}
      </div>
    </DemoFrame>
  );
}
