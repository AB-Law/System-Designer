import { useState } from "react";
import { EDGE, edgeOrigin } from "./analyzeModels";
import { DemoFrame, Predict, Slider } from "./parts";
import { dollars, n, pct } from "./format";

const GUESSES = [
  { id: "900", label: "About 900 a second" },
  { id: "500", label: "About 500 a second" },
  { id: "100", label: "About 100 a second" },
  { id: "10", label: "About 10 a second" },
];
const START = 90;

export function EdgeDemo() {
  const [guess, setGuess] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [hit, setHit] = useState(START);

  const lesson = edgeOrigin(START / 100);
  const tried = edgeOrigin(hit / 100);

  const reset = () => {
    setGuess(null);
    setRevealed(false);
    setHit(START);
  };

  return (
    <DemoFrame
      title="How much does a CDN take off the origin?"
      model="analyze"
      assumptions={[
        "The school and its numbers are invented for the lesson. The CDN, blob storage, response time and cost rules are the app's own.",
        `Every request is a read of the same kind of file. A write, such as uploading a new timetable, always reaches the origin: the edge only answers reads.`,
        "The hit ratio is a number you choose. A real workload decides its own, and a file that is rarely requested will not stay at the edge.",
        "Edge copies expiring, being replaced or being wrong are not modelled, and the model never loses a file. In a real system the origin must keep the original safely.",
        "The app caps the CDN hit ratio at 97%.",
      ]}
    >
      <p>
        On the first morning of term, {n(EDGE.rps)} requests a second arrive for the timetable PDF. The origin, which is blob storage, can
        answer {n(EDGE.originCapacity)} a second. Without a CDN it serves {pct(lesson.withoutCdn.served)} of requests.
      </p>
      <Predict
        question={`A CDN is added, and it answers ${START}% of requests from the edge. How many requests a second now reach the origin?`}
        options={GUESSES}
        guess={guess}
        onGuess={setGuess}
        revealed={revealed}
        onReveal={() => setRevealed(true)}
      />
      <div role="status" aria-live="polite">
        {revealed && (
          <div className="demo-result">
            <p>
              <b>{guess === "100" ? "Yes: about 100 a second." : "About 100 a second reach the origin."}</b> Only the {100 - START}% that
              the edge cannot answer goes on: {n(EDGE.rps)} × {((100 - START) / 100).toFixed(2)} = {n(lesson.withCdn.reaching)}. The origin
              was asked for {n(EDGE.rps)} before, so its load fell to a tenth.
            </p>

            <p>Now change the hit ratio.</p>
            <Slider label="Hit ratio" value={hit} min={0} max={97} step={1} onChange={setHit} text={`${hit}%`} />
            <table className="demo-table">
              <caption>The timetable with and without a CDN, at a {hit}% hit ratio</caption>
              <thead>
                <tr>
                  <th scope="col">Design</th>
                  <th scope="col">Reaching the origin</th>
                  <th scope="col">Origin busy</th>
                  <th scope="col">Served</th>
                  <th scope="col">Response time</th>
                  <th scope="col">Cost a month</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Origin only", tried.withoutCdn],
                  ["CDN in front", tried.withCdn],
                ].map(([label, o]) => (
                  <tr key={label as string}>
                    <th scope="row">{label as string}</th>
                    <td>{n((o as typeof tried.withCdn).reaching)} a second</td>
                    <td>{pct((o as typeof tried.withCdn).busy)}</td>
                    <td>{pct((o as typeof tried.withCdn).served)}</td>
                    <td>about {n((o as typeof tried.withCdn).responseMs)} ms</td>
                    <td>{dollars((o as typeof tried.withCdn).monthlyCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p aria-live="polite">
              At a {hit}% hit ratio, {n(tried.withCdn.reaching)} requests a second reach the origin, which is {pct(tried.withCdn.busy)} busy
              {tried.withCdn.busy > 1 ? " (more than it can answer)" : ""}, and {pct(tried.withCdn.served)} of requests are served. The CDN
              adds about {dollars(tried.withCdn.monthlyCost - tried.withoutCdn.monthlyCost)} a month.
            </p>
            <button type="button" className="btn small" onClick={reset}>
              Try the question again
            </button>
          </div>
        )}
      </div>
    </DemoFrame>
  );
}
