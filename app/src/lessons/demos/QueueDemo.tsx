import { useState } from "react";
import { n } from "./format";
import { DemoFrame, Predict, Result, Slider } from "./parts";
import { QUEUE_DEMO, runQueue } from "./queueModel";
import { restart } from "./restart";

const GUESSES = [
  { id: "10", label: "About 10 orders" },
  { id: "50", label: "About 50 orders" },
  { id: "100", label: "About 100 orders" },
  { id: "300", label: "About 300 orders" },
];

const mins = (x: number) => (Number.isFinite(x) ? `${x.toFixed(x < 10 && x % 1 ? 1 : 0)} minutes` : "no end");

export function QueueDemo() {
  const [guess, setGuess] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [rush, setRush] = useState(QUEUE_DEMO.rush);
  const [workers, setWorkers] = useState(QUEUE_DEMO.workers);
  const [length, setLength] = useState(QUEUE_DEMO.rushMinutes);

  const drain = QUEUE_DEMO.workers * QUEUE_DEMO.perWorker;
  const lesson = runQueue({ quiet: QUEUE_DEMO.quiet, rush: QUEUE_DEMO.rush, rushMinutes: QUEUE_DEMO.rushMinutes, drain });
  const tried = runQueue({ quiet: QUEUE_DEMO.quiet, rush, rushMinutes: length, drain: workers * QUEUE_DEMO.perWorker });
  const at = (q: typeof tried, m: number) => q.minutes.find((x) => x.minute === m)!;
  const peak = Math.max(1, tried.peakBacklog);
  const reset = () => {
    setGuess(null);
    setRevealed(false);
    setRush(QUEUE_DEMO.rush);
    setWorkers(QUEUE_DEMO.workers);
    setLength(QUEUE_DEMO.rushMinutes);
  };

  return (
    <DemoFrame
      title="Watch a backlog grow and drain"
      model="teaching"
      assumptions={[
        "This is a teaching model, not the app's simulator. The café and its numbers are invented for the lesson.",
        "Each minute, the backlog is what was waiting, plus the orders that arrived, minus what the workers can make, and never below zero.",
        "Every worker makes the same number of drinks a minute, and no job fails or is made twice.",
        "The wait is the backlog divided by the drain rate: the time to work through the orders ahead of the last one in. The app reports whether a consumer keeps up, but it does not play out waiting time.",
      ]}
    >
      <p>
        A café takes {n(QUEUE_DEMO.quiet)} orders a minute on a quiet day. Two baristas, making {n(QUEUE_DEMO.perWorker)} drinks a minute
        each, can make {n(drain)} a minute between them. At lunchtime, {n(QUEUE_DEMO.rush)} orders a minute arrive for{" "}
        {n(QUEUE_DEMO.rushMinutes)} minutes.
      </p>
      <Predict
        question="How many orders are waiting at the end of the ten-minute rush?"
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
              <b>{guess === "100" ? "Yes: about 100." : "About 100 orders are waiting."}</b> Each minute {n(QUEUE_DEMO.rush)} arrive and{" "}
              {n(drain)} are made, so the backlog grows by {n(QUEUE_DEMO.rush - drain)} a minute: {n(at(lesson, 1).backlog)} after one
              minute, {n(at(lesson, 5).backlog)} after five and {n(at(lesson, 10).backlog)} after ten. The last order in waits{" "}
              {mins(lesson.longestWait)}. Once the rush ends, {n(QUEUE_DEMO.quiet)} a minute arrive and {n(drain)} are made, so the backlog
              is gone by minute {lesson.clearedAt}.
            </p>

            <p>Now change the rush, the number of baristas and how long it lasts.</p>
            <Slider label="Orders a minute during the rush" value={rush} min={10} max={40} step={1} onChange={setRush} text={`${rush}`} />
            <Slider
              label="Baristas"
              value={workers}
              min={1}
              max={4}
              step={1}
              onChange={setWorkers}
              text={`${workers} (${n(workers * QUEUE_DEMO.perWorker)} drinks a minute)`}
            />
            <Slider
              label="How long the rush lasts"
              value={length}
              min={1}
              max={40}
              step={1}
              onChange={setLength}
              text={`${length} minutes`}
            />

            <div className="demo-bars" aria-hidden="true">
              {tried.minutes.map((m) => (
                <i key={m.minute} style={{ height: `${Math.round((m.backlog / peak) * 100)}%` }} />
              ))}
            </div>
            <table className="demo-table">
              <caption>Orders waiting, minute by minute</caption>
              <thead>
                <tr>
                  <th scope="col">Minute</th>
                  <th scope="col">Orders arriving</th>
                  <th scope="col">Orders waiting at the end of it</th>
                </tr>
              </thead>
              <tbody>
                {[1, 5, 10, 15, 20, 30, 40].map((m) => (
                  <tr key={m}>
                    <th scope="row">{m}</th>
                    <td>{n(at(tried, m).arrivals)}</td>
                    <td>{n(at(tried, m).backlog)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p aria-live="polite">
              {tried.peakBacklog === 0
                ? "The baristas keep up the whole time, so there is never a backlog."
                : `The backlog peaks at ${n(tried.peakBacklog)} orders, so the unluckiest customer waits ${mins(tried.longestWait)}. `}
              {tried.peakBacklog > 0 && tried.clearedAt !== null && `It is empty again at minute ${tried.clearedAt}.`}
              {tried.peakBacklog > 0 &&
                tried.clearedAt === null &&
                (tried.stillGrowing
                  ? " Orders are still arriving faster than they are made, so the backlog keeps growing and nobody sees an error."
                  : " It has not cleared by minute 40.")}
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
