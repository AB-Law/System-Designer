import { useState } from "react";
import { FORUM, forum } from "./analyzeModels";
import { dollars, n, pct } from "./format";
import { DemoFrame, Predict, Result, Slider } from "./parts";
import { restart } from "./restart";

const GUESSES = [
  { id: "1500", label: "About 1,500 writes a second: it scales with the copies" },
  { id: "1000", label: "About 1,000 writes a second" },
  { id: "same", label: "Still about 500 writes a second" },
  { id: "170", label: "About 170 writes a second: the work is shared out" },
];

export function ReplicasDemo() {
  const [guess, setGuess] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [copies, setCopies] = useState(3);
  const [slices, setSlices] = useState(1);
  const [share, setShare] = useState(Math.round(FORUM.writeShare * 100));

  const one = forum(1, 1);
  const three = forum(3, 1);
  const tried = forum(copies, slices, share / 100);
  const limit = tried.reads > tried.readLimit ? "reads" : tried.writes > tried.writeLimit ? "writes" : null;
  const reset = () => {
    setGuess(null);
    setRevealed(false);
    setCopies(3);
    setSlices(1);
    setShare(Math.round(FORUM.writeShare * 100));
  };

  return (
    <DemoFrame
      title="What do copies add, and what do slices add?"
      model="analyze"
      assumptions={[
        "The forum and its numbers are invented for the lesson. The way a database's limits and cost follow from its copies and slices is the Design Canvas's own.",
        "The app's database always keeps at least one read copy, so one is the smallest design here.",
        "A copy can be a moment behind the original, so a reader might not see a new post at once. The app does not model that delay.",
        "A slice only helps if a request can say which slice it needs. Choosing how to cut the data is a real design decision that this demo does not make for you.",
        "The web servers are sized so they are never the limit, so everything you see comes from the database.",
      ]}
    >
      <p>
        A hobbyist forum receives {n(FORUM.rps)} requests a second, about {pct(FORUM.writeShare)} of them posts and the rest reads. One node
        of its database answers {n(FORUM.nodeCapacity)} reads and {n(FORUM.nodeCapacity)} writes a second. With one read copy it serves{" "}
        {pct(one.served)} of the traffic.
      </p>
      <Predict
        question="The forum has one read copy besides the original. Two more are added, so it has three read copies. What is the most writes a second it can take now?"
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
              <b>{guess === "same" ? "Yes: still about 500." : "It is still about 500 writes a second."}</b> Every write has to go to the
              original, which passes it on to the copies. The copies share out the reading, so the read limit rose from {n(one.readLimit)}{" "}
              to {n(three.readLimit)} a second. The write limit did not move. With three copies the forum serves {pct(three.served)} of its
              traffic, because it is mostly reads.
            </p>

            <p>Now change the design. Copies and slices do different jobs.</p>
            <Slider label="Read copies" value={copies} min={1} max={6} step={1} onChange={setCopies} text={`${copies}`} />
            <Slider label="Slices of the data" value={slices} min={1} max={4} step={1} onChange={setSlices} text={`${slices}`} />
            <Slider
              label="Share of requests that are writes"
              value={share}
              min={0}
              max={50}
              step={1}
              onChange={setShare}
              text={`${share}%`}
            />
            <table className="demo-table">
              <caption>What this database can do</caption>
              <thead>
                <tr>
                  <th scope="col"></th>
                  <th scope="col">Asked for</th>
                  <th scope="col">Limit</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Reads a second</th>
                  <td>{n(tried.reads)}</td>
                  <td>{n(tried.readLimit)}</td>
                </tr>
                <tr>
                  <th scope="row">Writes a second</th>
                  <td>{n(tried.writes)}</td>
                  <td>{n(tried.writeLimit)}</td>
                </tr>
              </tbody>
            </table>
            <p aria-live="polite">
              {pct(tried.served)} of requests are served
              {limit === "reads" ? ": the read limit is passed. More copies would raise it." : ""}
              {limit === "writes" ? ": the write limit is passed. Copies do not raise it; slices do." : ""}
              {limit === null && tried.served >= 0.999 ? ": both limits are respected." : ""} The database costs about{" "}
              {dollars(tried.monthlyCost)} a month.
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
