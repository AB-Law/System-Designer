import { useState } from "react";
import { PARCELS, PARCEL_KEYS, parcels } from "./dataModels";
import { n, pct } from "./format";
import { Choice, DemoFrame, Predict, Result } from "./parts";
import { restart } from "./restart";

const GUESSES = [
  { id: "parcel_id", label: "The parcel number: there are millions of them" },
  { id: "depot_id", label: "The depot: every depot has about the same traffic" },
  { id: "scanned_at", label: "The time of the scan: new scans are spread over time" },
  { id: "any", label: "It makes no difference, as long as there is a key" },
];

export function ShardKeyDemo() {
  const [guess, setGuess] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [key, setKey] = useState("scanned_at");

  const tried = parcels(key);
  const reset = () => {
    setGuess(null);
    setRevealed(false);
    setKey("scanned_at");
  };

  return (
    <DemoFrame
      title="Which key spreads the load?"
      model="analyze"
      assumptions={[
        "The delivery company's scan log and its traffic are invented for the lesson. The way a shard key turns into an uneven load, and a question without the key into a question to every slice, is the Design Canvas's own.",
        "The app judges a key by how many different values it has and whether values only ever grow. A column with few values, or one that grows over time, is lumpy.",
        "Each slice here has the indexes its questions need, so the only thing that changes is the key.",
        "The app models hot slices and hot stream keys. It does not model a hot key in a cache.",
      ]}
    >
      <p>
        A delivery company logs every parcel scan, {n(PARCELS.rows)} so far, in a database cut into {PARCELS.shards} slices.{" "}
        {n(PARCELS.rps)} requests a second arrive: mostly a parcel&apos;s history, some new scans, and a few depot lists. One column decides
        which slice a row goes to.
      </p>
      <Predict
        question="Which column makes the best partition key for this log?"
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
              <b>{guess === "parcel_id" ? "Yes: the parcel number." : "The parcel number is the best of these."}</b> It has millions of
              values, so rows spread almost evenly, and the most common question already names it, so that question goes straight to one
              slice. The time of a scan only ever grows, so every new scan lands on the newest slice. The depot has too few values.
            </p>
            <p>Try each key and look at what changes.</p>
            <Choice legend="Partition key" options={PARCEL_KEYS} value={key} onChange={setKey} />
            <table className="demo-table">
              <caption>With {PARCEL_KEYS.find((k) => k.id === key)?.label.toLowerCase()} as the key</caption>
              <tbody>
                <tr>
                  <th scope="row">Share of the work on the busiest slice</th>
                  <td>
                    {pct(tried.busiest)} (even would be {pct(1 / PARCELS.shards)})
                  </td>
                </tr>
                <tr>
                  <th scope="row">A parcel&apos;s history</th>
                  <td>{tried.historyScatters ? "asked of every slice" : "goes to one slice"}</td>
                </tr>
                <tr>
                  <th scope="row">A depot&apos;s latest scans</th>
                  <td>{tried.depotScatters ? "asked of every slice" : "goes to one slice"}</td>
                </tr>
                <tr>
                  <th scope="row">Requests served</th>
                  <td>{pct(tried.served)}</td>
                </tr>
              </tbody>
            </table>
            <p aria-live="polite">
              {tried.usable < 0.5
                ? `Only about ${pct(tried.usable)} of the slices' combined capacity can be used, because one slice does most of the work. `
                : "The work is spread almost evenly. "}
              No key suits every question: a key that is good for one question makes another ask every slice.
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
