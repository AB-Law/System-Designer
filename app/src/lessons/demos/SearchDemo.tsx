import { useState } from "react";
import { NOTES, orderNotes } from "./dataModels";
import { dollars, n } from "./format";
import { DemoFrame, Predict, Result } from "./parts";
import { restart } from "./restart";

const GUESSES = [
  { id: "fine", label: "Nothing: a database can search words perfectly well" },
  { id: "warn", label: "A warning: word searches scan the database and slow every other query" },
  { id: "refuse", label: "It refuses to run the design" },
  { id: "faster", label: "It says this is faster than a search index" },
];

export function SearchDemo() {
  const [guess, setGuess] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [withIndex, setWithIndex] = useState(false);
  const plain = orderNotes(false);
  const tried = orderNotes(withIndex);
  const reset = () => {
    setGuess(null);
    setRevealed(false);
    setWithIndex(false);
  };

  return (
    <DemoFrame
      title="Where should a word search go?"
      model="analyze"
      assumptions={[
        "The shop's order notes and its traffic are invented for the lesson. The warning and the costs come from the Design Canvas.",
        "The app treats a search index as a block with a capacity and a cost. It does not model how words are matched.",
        "The app also does not model the search index being a moment behind the database. In real systems it can be.",
      ]}
    >
      <p>
        The shop&apos;s orders now have a note, and customers search the notes for words. There are {n(NOTES.rows)} notes. In this design
        every word search goes to the main database.
      </p>
      <Predict
        question="What does the Design Canvas say about this design?"
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
              <b>{guess === "warn" ? "Yes: a warning." : "It gives a warning."}</b> The finding is called &ldquo;Search without a search
              index&rdquo;: text queries scan the stored data and slow down every other query. Here that is up to {n(plain.notesRead)} notes
              read for a single search.
            </p>
            <label className="demo-opt">
              <input type="checkbox" checked={withIndex} onChange={(e) => setWithIndex(e.target.checked)} />
              <span>Add a search index and send word searches there</span>
            </label>
            <p aria-live="polite">
              {tried.searchFinding
                ? "The warning is still there: word searches scan the database. "
                : "The warning has gone: word searches no longer scan the database. "}
              The design costs about {dollars(tried.monthlyCost)} a month
              {withIndex ? `, ${dollars(tried.monthlyCost - plain.monthlyCost)} more for the search index` : ""}.
              {withIndex ? " The index is a second copy of the notes, so it has to be kept up to date." : ""}
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
