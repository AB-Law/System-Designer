import { useState } from "react";
import { STALE, staleRead } from "./dataTeaching";
import { pct } from "./format";
import { Choice, DemoFrame, Predict, Result, Slider } from "./parts";
import { restart } from "./restart";

const GUESSES = [
  { id: "yes", label: "Yes: the comment is saved, so every page shows it" },
  { id: "no", label: "No: the copy has not caught up yet" },
  { id: "error", label: "The site shows an error" },
  { id: "twice", label: "It shows the comment twice" },
];

const SOURCES = [
  { id: "copy", label: "From a copy of the data" },
  { id: "original", label: "From the original" },
];

export function StaleDemo() {
  const [guess, setGuess] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [source, setSource] = useState<"copy" | "original">("copy");
  const [lag, setLag] = useState(STALE.copyLagSec);
  const [after, setAfter] = useState(1);
  const [copyShare, setCopyShare] = useState(80);

  const tried = staleRead(source, lag, after, copyShare / 100);
  const reset = () => {
    setGuess(null);
    setRevealed(false);
    setSource("copy");
    setLag(STALE.copyLagSec);
    setAfter(1);
    setCopyShare(80);
  };

  return (
    <DemoFrame
      title="Is the site broken, or just behind?"
      model="teaching"
      assumptions={[
        "This is a teaching model, not the app's simulator. The app does not model a copy being behind: it treats every copy as up to date.",
        "The delay here is a single fixed number of seconds. Real delays vary, and are usually much shorter than a few seconds.",
        "The model has one comment and one reader. Real systems have many, and can also send a reader back to the original for a short while after they write.",
      ]}
    >
      <p>
        You post a comment on a site. The comment is saved in the original database, and a copy of the data is filled in from it about{" "}
        {STALE.copyLagSec} seconds later. One second after posting, you refresh the page, and it is read from the copy.
      </p>
      <Predict
        question="Do you see your comment?"
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
              <b>{guess === "no" ? "Right: not yet." : "Not yet."}</b> The comment is safe in the original, but the copy was still{" "}
              {STALE.copyLagSec - 1} seconds behind. Nothing is broken. You read an older version of the data, which is a stale read.
            </p>
            <Choice
              legend="Where this refresh is read from"
              options={SOURCES}
              value={source}
              onChange={(s) => setSource(s as "copy" | "original")}
            />
            <Slider label="How far behind the copy is" value={lag} min={0} max={10} step={1} onChange={setLag} text={`${lag} seconds`} />
            <Slider label="Refresh after" value={after} min={0} max={10} step={1} onChange={setAfter} text={`${after} seconds`} />
            <Slider
              label="Share of reads sent to a copy"
              value={copyShare}
              min={0}
              max={100}
              step={5}
              onChange={setCopyShare}
              text={`${copyShare}%`}
            />
            <p aria-live="polite">
              <b>{tried.seen ? "You see your comment." : "You do not see your comment yet."}</b> The original answers{" "}
              {pct(tried.originalLoad)} of reads, and the copies the rest.{" "}
              {copyShare === 0
                ? "Every read is fresh, and the original carries all the load."
                : "Reads from a copy take load off the original, at the price of sometimes being a moment behind."}
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
