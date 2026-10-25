import { useState } from "react";
import { BATON, afterReading, canReplay, countsAsReplayable } from "./dataTeaching";
import { DemoFrame, Predict, Result, Slider } from "./parts";
import { restart } from "./restart";

const GUESSES = [
  { id: "stream", label: "The stream can be read again from the start. The queue's jobs are gone" },
  { id: "both", label: "Both can be read again from the start" },
  { id: "neither", label: "Neither can be read again" },
  { id: "queue", label: "The queue can be read again. The stream's events are gone" },
];

const AGE_HOURS = 30;

export function StreamDemo() {
  const [guess, setGuess] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [read, setRead] = useState(4);
  const [retention, setRetention] = useState(48);

  const view = afterReading(read);
  const reset = () => {
    setGuess(null);
    setRevealed(false);
    setRead(4);
    setRetention(48);
  };

  return (
    <DemoFrame
      title="A log you can read again"
      model="teaching"
      assumptions={[
        "This is a teaching model, not the app's simulator. The relay events and the two parts of the stream are fixed.",
        "Order is kept for events with the same key. The events of different runners can be interleaved in any way, and the model shows one of them.",
        `The app counts a stream as able to replay when it keeps events for at least ${BATON.replayHours} hours. It does not model a reader falling behind or events being lost.`,
        "A real queue may hold jobs back for a retry. This one is the plain case: a job that has been taken and finished is gone.",
      ]}
    >
      <p>
        A relay team logs six events: each runner starting and handing over. One program has read the first four. Then someone finds a bug
        in the code that read them, and the four have to be processed again. The events were written to a stream. In a second set-up they
        were put on a queue as jobs.
      </p>
      <Predict
        question="After the first four are read and finished, what can be done about the bug?"
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
              <b>{guess === "stream" ? "Yes: the stream can be read again." : "The stream can be read again; the queue cannot."}</b> A
              stream keeps its events after they are read. A reader only moves its own place, so it can go back to the start and read the
              four again. A queue hands each job out, and a job that is finished is gone.
            </p>
            <Slider
              label="Events the first program has read"
              value={read}
              min={0}
              max={BATON.events.length}
              step={1}
              onChange={setRead}
              text={`${read} of ${BATON.events.length}`}
            />
            <div className="demo-cols">
              <section aria-label="The stream">
                <h4>Stream, in {BATON.parts} parts</h4>
                {view.parts.map((p, i) => (
                  <ol key={i} aria-label={`Part ${i + 1}, in order`}>
                    {p.map((e, j) => (
                      <li key={j}>
                        {e.text} <span className="muted">{e.read ? "(read)" : "(not read yet)"}</span>
                      </li>
                    ))}
                  </ol>
                ))}
                <p>
                  <b>{view.inLog}</b> events still in the log. The reader can go back to the start.
                </p>
              </section>
              <section aria-label="The queue">
                <h4>Queue</h4>
                <p>
                  <b>{view.inQueue}</b> {view.inQueue === 1 ? "job" : "jobs"} left to do. The {read} that were taken and finished are gone.
                </p>
              </section>
            </div>
            <p>
              Order is kept within a part, so each runner&apos;s events stay in order. Events in different parts may be read in either
              order.
            </p>
            <Slider
              label={`How long the stream keeps events (the bug is ${AGE_HOURS} hours old)`}
              value={retention}
              min={1}
              max={72}
              step={1}
              onChange={setRetention}
              text={`${retention} hours`}
            />
            <p aria-live="polite">
              {canReplay(retention, AGE_HOURS)
                ? `The events are still there, so the four can be read again.`
                : `The stream has already thrown the events away, so they cannot be read again.`}{" "}
              {countsAsReplayable(retention)
                ? `The app counts a stream that keeps events this long as able to replay.`
                : `The app does not count a stream that keeps events for less than ${BATON.replayHours} hours as able to replay.`}
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
