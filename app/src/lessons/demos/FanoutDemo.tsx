import { useState } from "react";
import { FANOUT, fanout, type FanoutMode } from "./dataTeaching";
import { n } from "./format";
import { Choice, DemoFrame, Predict, Result } from "./parts";
import { restart } from "./restart";

const GUESSES = [
  { id: "instant", label: "Under a second" },
  { id: "minute", label: "About a minute" },
  { id: "13", label: "About 13 minutes" },
  { id: "hours", label: "About 3 hours" },
];

const MODES = [
  { id: "write", label: "Copy to every member's pigeonhole when the notice is posted" },
  { id: "read", label: "Keep one notice, and let each member pick theirs out when they look" },
  { id: "mix", label: `Copy ahead for clubs up to ${n(FANOUT.mixLimit)} members, pick out on read for bigger ones` },
];

const time = (s: number) => (s < 1 ? "under a second" : s < 120 ? `${n(s)} seconds` : `about ${n(s / 60)} minutes`);

export function FanoutDemo() {
  const [guess, setGuess] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [mode, setMode] = useState<FanoutMode>("write");
  const famous = fanout(FANOUT.clubs[2].members, "write");
  const reset = () => {
    setGuess(null);
    setRevealed(false);
    setMode("write");
  };

  return (
    <DemoFrame
      title="Who writes the copies?"
      model="teaching"
      assumptions={[
        "This is a teaching model, not the app's simulator. The clubs, the copying speed and the number of places a member follows are invented.",
        `The system is assumed to make ${n(FANOUT.copiesPerSec)} copies a second, and a member follows ${FANOUT.follows} sources, so picking out on read means looking in ${FANOUT.follows} places.`,
        "Real systems rank, filter and cache what they show. This model counts only copies and lookups.",
        "The app does not play this out. It tests whether a design copes with one very popular item by making one feature busier than the rest.",
      ]}
    >
      <p>
        A famous club has {n(FANOUT.clubs[2].members)} members. Its secretary posts a notice, and the club copies it into every
        member&apos;s pigeonhole so that reading is quick. The copying speed is {n(FANOUT.copiesPerSec)} copies a second.
      </p>
      <Predict
        question="How long until the last member can see the notice?"
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
              <b>{guess === "13" ? "Yes: about 13 minutes." : "It takes about 13 minutes."}</b> {n(famous.copiesPerPost)} copies at{" "}
              {n(FANOUT.copiesPerSec)} a second is {n(famous.secondsToReach)} seconds. The first members see it at once and the last wait
              most of a quarter of an hour, and all that copying happens for members who may never look.
            </p>
            <p>Now choose where the work is done, and look at each club.</p>
            <Choice legend="Where the work is done" options={MODES} value={mode} onChange={(m) => setMode(m as FanoutMode)} />
            <table className="demo-table">
              <caption>Work for each club</caption>
              <thead>
                <tr>
                  <th scope="col">Club</th>
                  <th scope="col">Done</th>
                  <th scope="col">Copies for one notice</th>
                  <th scope="col">Last member sees it</th>
                  <th scope="col">Places looked in per view</th>
                </tr>
              </thead>
              <tbody>
                {FANOUT.clubs.map((c) => {
                  const f = fanout(c.members, mode);
                  return (
                    <tr key={c.id}>
                      <th scope="row">{c.label}</th>
                      <td>{f.mode === "write" ? "on write" : "on read"}</td>
                      <td>{n(f.copiesPerPost)}</td>
                      <td>{time(f.secondsToReach)}</td>
                      <td>{n(f.lookupsPerView)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p aria-live="polite">
              Copying on write makes every view a single lookup and every notice as many copies as there are members. Picking out on read
              makes a notice one copy and every view a search of {FANOUT.follows} places. The mix gives small clubs quick reading and big
              ones quick posting.
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
