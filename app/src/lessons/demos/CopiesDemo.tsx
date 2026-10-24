import { useId, useState } from "react";
import { COPIES, copies } from "./analyzeModels";
import { DemoFrame, Predict, Slider } from "./parts";
import { dollars, n, pct } from "./format";

const GUESSES = [
  { id: "all", label: "All of them" },
  { id: "five-sixths", label: "About 5 in 6 (83%)" },
  { id: "two-thirds", label: "About two thirds" },
  { id: "none", label: "None" },
];

export function CopiesDemo() {
  const box = useId();
  const [guess, setGuess] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [count, setCount] = useState(3);
  const [down, setDown] = useState(false);

  const three = copies(3);
  const tried = copies(count);
  const shown = down ? tried.oneDown : tried.normal;

  const reset = () => {
    setGuess(null);
    setRevealed(false);
    setCount(3);
    setDown(false);
  };

  return (
    <DemoFrame
      title="What do extra copies buy you?"
      model="analyze"
      assumptions={[
        "The bakery and its numbers are invented for the lesson. The rules for how load is shared, response time and cost are the app's own.",
        `Every copy is identical, handles ${n(COPIES.capacityEach)} requests a second, and keeps nothing the others need. Sessions and shared state are not modelled.`,
        "The load balancer is a block with its own cost. It is shown as two copies, so it does not fail in this example.",
        "A single copy that fails leaves nothing standing. That case is stated in words here, not simulated.",
        "The server does not scale itself up in this example.",
      ]}
    >
      <p>
        The bakery now runs 3 copies of its server behind a load balancer. Each copy handles {n(COPIES.capacityEach)} requests a second, and{" "}
        {n(COPIES.rps)} requests a second arrive.
      </p>
      <Predict
        question="One of the three copies fails. What share of requests is still served?"
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
              <b>{guess === "all" ? "Yes: all of them." : "All of them are still served."}</b> Two copies are left, and together they handle{" "}
              {n(2 * COPIES.capacityEach)} requests a second. That is more than {n(COPIES.rps)}, so there is no loss. The price of that
              safety is a third server on the bill: about {dollars(three.normal.monthlyCost)} a month in all.
            </p>

            <p>Now change the number of copies, and take one down.</p>
            <Slider label="Copies" value={count} min={1} max={5} step={1} onChange={setCount} text={`${count}`} />
            <div className="demo-try">
              <label htmlFor={box} className="demo-opt">
                <input id={box} type="checkbox" checked={down} onChange={(e) => setDown(e.target.checked)} />
                <span>Take one copy down</span>
              </label>
            </div>
            <table className="demo-table">
              <caption>The bakery with {count === 1 ? "1 copy" : `${count} copies`}</caption>
              <thead>
                <tr>
                  <th scope="col">Situation</th>
                  <th scope="col">Copies working</th>
                  <th scope="col">Served</th>
                  <th scope="col">Response time</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">All copies working</th>
                  <td>{count}</td>
                  <td>{pct(tried.normal.served)}</td>
                  <td>about {n(tried.normal.responseMs)} ms</td>
                </tr>
                <tr>
                  <th scope="row">One copy down</th>
                  <td>{tried.survivors}</td>
                  <td>{pct(tried.oneDown.served)}</td>
                  <td>{tried.survivors === 0 ? "no server to answer" : `about ${n(tried.oneDown.responseMs)} ms`}</td>
                </tr>
              </tbody>
            </table>
            <p aria-live="polite">
              {down
                ? tried.survivors === 0
                  ? "With a single copy, taking it down leaves nothing to answer requests: none are served."
                  : `With one of ${count} copies down, ${tried.survivors} ${tried.survivors === 1 ? "is" : "are"} left and ${pct(shown.served)} of requests are served.`
                : `With all ${count} ${count === 1 ? "copy" : "copies"} working, ${pct(shown.served)} of requests are served.`}{" "}
              The whole design costs about {dollars(tried.normal.monthlyCost)} a month, including the load balancer.
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
