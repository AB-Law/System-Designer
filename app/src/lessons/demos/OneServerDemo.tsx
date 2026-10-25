import { useState } from "react";
import { ONE_SERVER, oneServer } from "./analyzeModels";
import { DemoFrame, Predict, Result, Slider } from "./parts";
import { restart } from "./restart";
import { dollars, n, pct } from "./format";

const GUESSES = [
  { id: "all", label: "All of them" },
  { id: "five-sixths", label: "About 5 in 6 (83%)" },
  { id: "half", label: "About half" },
  { id: "none", label: "None: the site goes down" },
];

export function OneServerDemo() {
  const [guess, setGuess] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [rps, setRps] = useState(ONE_SERVER.busyRps);
  const [capacity, setCapacity] = useState(ONE_SERVER.capacity);

  const quiet = oneServer(ONE_SERVER.quietRps, ONE_SERVER.capacity);
  const busy = oneServer(ONE_SERVER.busyRps, ONE_SERVER.capacity);
  const tried = oneServer(rps, capacity);

  const reset = () => {
    setGuess(null);
    setRevealed(false);
    setRps(ONE_SERVER.busyRps);
    setCapacity(ONE_SERVER.capacity);
  };

  return (
    <DemoFrame
      title="What happens when one server is full?"
      model="analyze"
      assumptions={[
        "The bakery and its numbers are invented for the lesson. The simulator's rules for response time and cost are the same ones the Design Canvas uses.",
        "There is one server and nothing else. Requests that arrive beyond its capacity are not served.",
        "Response time and monthly cost come from the app's simple rules. They are good enough to show the pattern. They are not a forecast for a real system.",
        "The server does not scale itself up in this example.",
      ]}
    >
      <p>
        The bakery's order page runs on one server that can handle {n(ONE_SERVER.capacity)} requests a second. On a normal day{" "}
        {n(ONE_SERVER.quietRps)} requests a second arrive, and everything is served.
      </p>
      <Predict
        question={`On the Saturday before a bank holiday, ${n(ONE_SERVER.busyRps)} requests a second arrive. What share of them is served?`}
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
              <b>{guess === "five-sixths" ? "Yes: about 5 in 6." : "About 5 in 6 are served."}</b> The server can answer{" "}
              {n(ONE_SERVER.capacity)} of the {n(ONE_SERVER.busyRps)} requests each second: {n(ONE_SERVER.capacity)} ÷{" "}
              {n(ONE_SERVER.busyRps)} = {pct(busy.served)}. The rest are not answered, and the ones that are take longer.
            </p>
            <table className="demo-table">
              <caption>The same server on a quiet day and a busy one</caption>
              <thead>
                <tr>
                  <th scope="col">Day</th>
                  <th scope="col">Requests a second</th>
                  <th scope="col">Served</th>
                  <th scope="col">Response time</th>
                  <th scope="col">Server busy</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Normal day", quiet],
                  ["Busy Saturday", busy],
                ].map(([label, o]) => (
                  <tr key={label as string}>
                    <th scope="row">{label as string}</th>
                    <td>{n((o as typeof quiet).offered)}</td>
                    <td>{pct((o as typeof quiet).served)}</td>
                    <td>about {n((o as typeof quiet).responseMs)} ms</td>
                    <td>{pct((o as typeof quiet).busy)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p>Now try your own numbers.</p>
            <Slider label="Requests a second" value={rps} min={20} max={400} step={10} onChange={setRps} text={`${n(rps)} a second`} />
            <Slider
              label="Server capacity"
              value={capacity}
              min={50}
              max={300}
              step={50}
              onChange={setCapacity}
              text={`${n(capacity)} a second`}
            />
            <p aria-live="polite">
              {n(rps)} requests a second against a capacity of {n(capacity)}: {pct(tried.served)} served, response time about{" "}
              {n(tried.responseMs)} ms, server {pct(tried.busy)} busy
              {tried.busy > 1 ? " (more work than it can do)" : ""}, costing about {dollars(tried.monthlyCost)} a month.
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
