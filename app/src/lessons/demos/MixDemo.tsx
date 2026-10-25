import { useState } from "react";
import { MIX_DEMO, mixOutcome } from "./mixModel";
import { n, pct } from "./format";
import { DemoFrame, Predict, Result, Slider } from "./parts";
import { restart } from "./restart";

const GUESSES = [
  { id: "copes", label: "It copes: 1,000 requests a second is well under the 2,000 reads it can answer" },
  { id: "writes", label: "It passes its write limit, even though its read limit is nowhere near" },
  { id: "reads", label: "It passes its read limit first" },
  { id: "double", label: "Nothing goes wrong until the traffic doubles" },
];

const VERDICT = {
  none: "both limits are respected",
  reads: "the read limit is passed",
  writes: "the write limit is passed",
  both: "both limits are passed",
} as const;

export function MixDemo() {
  const [guess, setGuess] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [share, setShare] = useState(30);

  const recipe = mixOutcome(MIX_DEMO.recipeWriteShare);
  const ferry = mixOutcome(MIX_DEMO.ferryWriteShare);
  const tried = mixOutcome(share / 100);
  const reset = () => {
    setGuess(null);
    setRevealed(false);
    setShare(30);
  };

  return (
    <DemoFrame
      title="Which limit does the mix reach first?"
      model="teaching"
      assumptions={[
        "This is a teaching model, not a measurement. The limits are invented for the lesson: a database that answers 2,000 reads a second and 400 writes a second.",
        "The way the two limits combine into one total is the rule the Design Canvas database block uses.",
        "Real stores differ a great deal. In some, writing is not slower than reading, and then the mix matters much less.",
        "There is no cache here. A cache would take reads off the store and leave the writes exactly where they are.",
      ]}
    >
      <p>
        A recipe site and a ferry booking page each receive {n(MIX_DEMO.requestsPerSec)} requests a second. They use the same database,
        which can answer {n(MIX_DEMO.readLimit)} reads a second and {n(MIX_DEMO.writeLimit)} writes a second. The recipe site is{" "}
        {pct(MIX_DEMO.recipeWriteShare)} writes. The ferry page is {pct(MIX_DEMO.ferryWriteShare)} writes.
      </p>
      <Predict
        question="What happens to the ferry booking page?"
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
              <b>{guess === "writes" ? "Yes: the write limit is passed." : "The write limit is passed."}</b> The ferry page asks for{" "}
              {n(ferry.writes)} writes a second against a limit of {n(ferry.writeLimit)}. Its {n(ferry.reads)} reads are far inside the read
              limit, so the writes are what give out.
            </p>
            <table className="demo-table">
              <caption>The same database under two mixes</caption>
              <thead>
                <tr>
                  <th scope="col">Page</th>
                  <th scope="col">Reads a second</th>
                  <th scope="col">Writes a second</th>
                  <th scope="col">Most it can take in total</th>
                  <th scope="col">Result</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Recipe site", recipe],
                  ["Ferry page", ferry],
                ].map(([label, o]) => {
                  const m = o as typeof recipe;
                  return (
                    <tr key={label as string}>
                      <th scope="row">{label as string}</th>
                      <td>
                        {n(m.reads)} (limit {n(m.readLimit)})
                      </td>
                      <td>
                        {n(m.writes)} (limit {n(m.writeLimit)})
                      </td>
                      <td>{n(m.maxTotal)} a second</td>
                      <td>{VERDICT[m.limitedBy]}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <Slider
              label="Share of requests that are writes"
              value={share}
              min={0}
              max={100}
              step={1}
              onChange={setShare}
              text={`${share}%`}
            />
            <p aria-live="polite">
              At {share}% writes, {n(tried.reads)} reads and {n(tried.writes)} writes arrive each second: {VERDICT[tried.limitedBy]}. The
              most this database can take in total at this mix is {n(tried.maxTotal)} requests a second.
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
