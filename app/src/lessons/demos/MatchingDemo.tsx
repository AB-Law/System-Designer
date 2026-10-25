import { useState } from "react";
import { n } from "./format";
import { Choice, DemoFrame, Predict, Result, Slider } from "./parts";
import { BIKES, matchRiders, type LockScope } from "./realTimeModels";
import { restart } from "./restart";

const GUESSES = [
  { id: "20", label: "20 ms: one claim's time" },
  { id: "200", label: "About 200 ms" },
  { id: "800", label: "About 800 ms: every claim waits its turn" },
  { id: "4000", label: "About 4 seconds" },
];
const LOCKS = [
  { id: "city", label: "One lock for the whole festival" },
  { id: "bike", label: "A lock on each bike" },
];

export function MatchingDemo() {
  const [guess, setGuess] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [lock, setLock] = useState<LockScope>("bike");
  const [hot, setHot] = useState(25);

  const city = matchRiders("city", 0.25);
  const tried = matchRiders(lock, hot / 100);
  const reset = () => {
    setGuess(null);
    setRevealed(false);
    setLock("bike");
    setHot(25);
  };

  return (
    <DemoFrame
      title="Whose bike is it?"
      model="teaching"
      assumptions={[
        "This is a teaching model, not the app's simulator. The festival, the numbers of visitors and bikes and the length of a claim are invented.",
        `A claim holds a lock for ${BIKES.claimMs} ms. With a lock on each bike, the model assumes visitors who want different bikes go at once, which is the best case. In real systems two visitors may want the same bike and one tries the next.`,
        "A bike goes to one visitor only. Visitors beyond the bikes in their area are turned away.",
        "The app models a geographic index, area shards and exclusive access for the claim. It does not model maps, or the choice between a lock for each driver and one for the city.",
      ]}
    >
      <p>
        A festival has {BIKES.riders} bikes in {BIKES.areas} areas, {BIKES.perArea} in each. {BIKES.riders} visitors ask for the nearest
        free bike in the same second. Each claim takes {BIKES.claimMs} ms. At first the visitors are spread evenly.
      </p>
      <Predict
        question="With one lock for the whole festival, how long does the last visitor wait for an answer?"
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
              <b>{guess === "800" ? "Yes: about 800 ms." : "About 800 ms."}</b> The {BIKES.riders} claims go through the one lock in a line,{" "}
              {BIKES.claimMs} ms each, so the last visitor waits {n(city.lastAnswerMs)} ms.
            </p>
            <p>Now change the lock, and then send a crowd to one area.</p>
            <Choice legend="What the lock covers" options={LOCKS} value={lock} onChange={(id) => setLock(id as LockScope)} />
            <Slider label="Share of visitors in the busy area" value={hot} min={25} max={100} step={5} onChange={setHot} text={`${hot}%`} />
            <table className="demo-table">
              <caption>What happens</caption>
              <tbody>
                <tr>
                  <th scope="row">Visitors in each area</th>
                  <td>{tried.ridersByArea.join(", ")}</td>
                </tr>
                <tr>
                  <th scope="row">Visitors given a bike</th>
                  <td>{tried.matched}</td>
                </tr>
                <tr>
                  <th scope="row">Visitors told none is free</th>
                  <td>{tried.turnedAway}</td>
                </tr>
                <tr>
                  <th scope="row">The last visitor waits</th>
                  <td>{n(tried.lastAnswerMs)} ms</td>
                </tr>
              </tbody>
            </table>
            <p aria-live="polite">
              {tried.turnedAway > 0
                ? "Look at the visitors turned away: the busy area has only ten bikes, and no lock can make more. The lock changes how long people wait, not how many bikes there are."
                : lock === "city"
                  ? "Everyone gets a bike, but the one lock makes the line long."
                  : "Everyone gets a bike, and visitors who want different bikes do not wait for each other."}
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
