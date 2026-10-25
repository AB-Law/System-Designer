import { useId, useState } from "react";
import { n, pct } from "./format";
import { DemoFrame, Predict, Result, Slider } from "./parts";
import { restart } from "./restart";
import { TIMEOUT_DEMO, timeoutOutcome } from "./timeoutModel";

const GUESSES = [
  { id: "failed", label: "The address lookup failed, so nothing was done" },
  { id: "unknown", label: "We only know we stopped waiting: the lookup may still have finished" },
  { id: "slow", label: "The page waits the full 800 ms, then shows the answer" },
  { id: "error", label: "The visitor sees an error after 300 ms" },
];

export function TimeoutDemo() {
  const fallbackBox = useId();
  const [guess, setGuess] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [typical, setTypical] = useState(TIMEOUT_DEMO.typicalMs);
  const [timeout, setTimeout_] = useState(TIMEOUT_DEMO.timeoutMs);
  const [fallback, setFallback] = useState(true);

  const tried = timeoutOutcome(typical, timeout, fallback);
  const reset = () => {
    setGuess(null);
    setRevealed(false);
    setTypical(TIMEOUT_DEMO.typicalMs);
    setTimeout_(TIMEOUT_DEMO.timeoutMs);
    setFallback(true);
  };

  return (
    <DemoFrame
      title="What does a timeout tell you?"
      model="teaching"
      assumptions={[
        "This is a teaching model, not the app's simulator. The postcode service and its numbers are invented for the lesson.",
        "Calls take a time spread evenly from half to one and a half times the typical figure. Real response times are not spread like that.",
        "A timeout stops the caller waiting. It does not make the provider faster, and it does not cancel what the provider is doing.",
        "The fallback here is showing the address as typed. Not every call has a sensible fallback.",
      ]}
    >
      <p>
        A delivery app asks a postcode service to turn each address into a place on the map. On a bad day the service takes about{" "}
        {n(TIMEOUT_DEMO.slowTypicalMs)} ms to answer. The app gives up after {n(TIMEOUT_DEMO.slowTimeoutMs)} ms and shows the address as the
        customer typed it.
      </p>
      <Predict
        question={`The timeout fires at ${n(TIMEOUT_DEMO.slowTimeoutMs)} ms. What do we know about the lookup?`}
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
              <b>{guess === "unknown" ? "Yes: we only know we stopped waiting." : "We only know we stopped waiting."}</b> The service may
              have received the request, looked up the address and sent an answer that arrived too late. The timeout bounded how long the
              page waited, and the fallback kept the page working. It did not tell us whether the lookup happened.
            </p>
            <p>Now try your own numbers.</p>
            <Slider
              label="Typical response time"
              value={typical}
              min={50}
              max={1000}
              step={10}
              onChange={setTypical}
              text={`${n(typical)} ms`}
            />
            <Slider label="Timeout" value={timeout} min={50} max={1000} step={10} onChange={setTimeout_} text={`${n(timeout)} ms`} />
            <div className="demo-try">
              <label htmlFor={fallbackBox} className="demo-opt">
                <input id={fallbackBox} type="checkbox" checked={fallback} onChange={(e) => setFallback(e.target.checked)} />
                <span>Show the address as typed when the lookup times out</span>
              </label>
            </div>
            <table className="demo-table">
              <caption>
                A provider that usually takes {n(typical)} ms ({n(tried.fastestMs)} to {n(tried.slowestMs)} ms), with a timeout of{" "}
                {n(timeout)} ms
              </caption>
              <tbody>
                <tr>
                  <th scope="row">Calls that do not come back in time</th>
                  <td>{pct(tried.timedOut)}</td>
                </tr>
                <tr>
                  <th scope="row">Calls whose answer is used</th>
                  <td>{pct(tried.answered)}</td>
                </tr>
                <tr>
                  <th scope="row">Average wait</th>
                  <td>about {n(tried.averageWaitMs)} ms</td>
                </tr>
                <tr>
                  <th scope="row">Visitors who still see the page</th>
                  <td>{pct(tried.pageShown)}</td>
                </tr>
              </tbody>
            </table>
            <p aria-live="polite">
              {timeout < typical
                ? `The timeout is shorter than the provider's usual time, so ${pct(tried.timedOut)} of calls are given up on even though the provider is working normally. `
                : tried.timedOut === 0
                  ? "Every call comes back in time. "
                  : `${pct(tried.timedOut)} of calls are given up on. `}
              {tried.timedOut > 0 &&
                (fallback
                  ? "The fallback keeps the page working for those visitors, without the lookup."
                  : "With no fallback, those visitors get an error.")}{" "}
              The timeout caps any one wait at {n(timeout)} ms.
              {tried.timedOut > 0 && " For the calls it gives up on, the provider may still finish the work."}
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
