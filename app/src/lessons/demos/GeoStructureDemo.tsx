import { useState } from "react";
import { dollars, n, pct } from "./format";
import { GEO_STRUCTURES, STANDS, bikeStands } from "./mediaModels";
import { Choice, DemoFrame, Predict, Result, Slider } from "./parts";
import { restart } from "./restart";

const GUESSES = [
  { id: "Geohash grid", label: "The geohash grid: it is the quickest to update" },
  { id: "Quadtree", label: "The quadtree: it splits crowded squares" },
  { id: "R-tree", label: "The R-tree: it answers questions best" },
  { id: "same", label: "They answer the same number of questions" },
];

export function GeoStructureDemo() {
  const [guess, setGuess] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [structure, setStructure] = useState("Geohash grid");
  const [shards, setShards] = useState(1);
  const [copies, setCopies] = useState(1);
  const [updates, setUpdates] = useState(Math.round(STANDS.updateShare * 100));

  const tried = bikeStands(structure, shards, copies, updates / 100);
  const reset = () => {
    setGuess(null);
    setRevealed(false);
    setStructure("Geohash grid");
    setShards(1);
    setCopies(1);
    setUpdates(Math.round(STANDS.updateShare * 100));
  };

  return (
    <DemoFrame
      title="Which structure suits which traffic?"
      model="analyze"
      assumptions={[
        "The bike-stand app and its traffic are invented for the lesson. The way each structure turns into question and update limits is the Design Canvas's own.",
        "The app gives each structure a multiplier on its capacity. It does not draw a map or work out real distances.",
        "Extra copies add capacity for questions but not for updates, because every copy must apply every update.",
        "Splitting the map into areas spreads a crowded centre across more nodes. The app models this crowding with a single figure per structure.",
      ]}
    >
      <p>
        A bike-share app has {n(STANDS.rps)} requests a second, nearly all of them &ldquo;find the nearest stand&rdquo;. Stands almost never
        move: about {pct(STANDS.updateShare)} of requests add or move one. The index sits on one area of the map with one copy.
      </p>
      <Predict
        question="Which structure lets the index answer the most questions a second for this traffic?"
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
              <b>{guess === "R-tree" ? "Yes: the R-tree." : "The R-tree."}</b> Stands almost never move, so updates are rare and answering
              questions is what matters. The R-tree answers questions best, and the grid, which crowds in a busy centre, answers fewest. The
              grid&apos;s edge is fast updates, and this traffic hardly has any.
            </p>
            <p>Now change the structure and the traffic.</p>
            <Choice legend="Index structure" options={GEO_STRUCTURES} value={structure} onChange={setStructure} />
            <Slider label="Areas the map is split into" value={shards} min={1} max={8} step={1} onChange={setShards} text={`${shards}`} />
            <Slider label="Copies of each area" value={copies} min={1} max={4} step={1} onChange={setCopies} text={`${copies}`} />
            <Slider
              label="Share of requests that add or move a place"
              value={updates}
              min={0}
              max={60}
              step={1}
              onChange={setUpdates}
              text={`${updates}%`}
            />
            <table className="demo-table">
              <caption>What the index can do</caption>
              <tbody>
                <tr>
                  <th scope="row">Most questions a second</th>
                  <td>{n(tried.queryLimit)}</td>
                </tr>
                <tr>
                  <th scope="row">Most updates a second</th>
                  <td>{n(tried.updateLimit)}</td>
                </tr>
                <tr>
                  <th scope="row">Requests served</th>
                  <td>{pct(tried.served)}</td>
                </tr>
                <tr>
                  <th scope="row">Monthly cost</th>
                  <td>{dollars(tried.monthlyCost)}</td>
                </tr>
              </tbody>
            </table>
            <p aria-live="polite">
              Push the updates up to 60%, like a fleet of moving cars: the R-tree, which costs most to update, falls behind the grid and the
              quadtree. Copies raise only the question limit, and more areas raise both.
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
