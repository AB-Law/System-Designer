import { useState } from "react";
import { n } from "./format";
import { CARDS, wordSearch } from "./mediaModels";
import { DemoFrame, Predict, Result } from "./parts";
import { restart } from "./restart";

const GUESSES = [
  { id: "10000", label: "About 10,000: every card has to be checked" },
  { id: "650", label: "About 650: the cards on the lemon list and the thyme list" },
  { id: "40", label: "About 40: the cards that mention lemon and thyme" },
  { id: "10", label: "About 10: only the cards with both words" },
];

export function WordIndexDemo() {
  const [guess, setGuess] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [chosen, setChosen] = useState<string[]>(["lemon", "thyme"]);

  const pair = wordSearch(["lemon", "thyme"]);
  const tried = wordSearch(chosen);
  const reset = () => {
    setGuess(null);
    setRevealed(false);
    setChosen(["lemon", "thyme"]);
  };
  const toggle = (id: string) => setChosen(chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id]);

  return (
    <DemoFrame
      title="Reading lists, not cards"
      model="teaching"
      assumptions={[
        "This is a teaching model, not the app's simulator. The cards, the words and how many cards each word is on are invented.",
        "Words are assumed to fall on cards independently of each other. Real words do not, which is why real searches need more care.",
        "The model counts cards and list entries. It does not rank results, forgive spelling mistakes or work out what a word means.",
        "The app treats a search index as a block with a capacity and a cost. It does not match words.",
      ]}
    >
      <p>
        A box holds {n(CARDS.total)} recipe cards. Lemon is on {n(CARDS.words[0].cards)} of them and thyme on {n(CARDS.words[1].cards)}. For
        each word there is a list of the cards that have it. You want the cards with both words.
      </p>
      <Predict
        question="Using the two lists, about how many cards do you need to open and read?"
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
              <b>{guess === "10" ? "Yes: about 10." : "About 10."}</b> You read the two lists, {n(pair.listEntries)} entries in all, and
              find the cards that are on both. About {n(pair.matches)} cards are. Only those are opened. A scan would have opened{" "}
              {n(pair.scanCards)}.
            </p>
            <p>Now choose the words, and see what each search costs.</p>
            <fieldset className="demo-try">
              <legend>Words to search for</legend>
              {CARDS.words.map((w) => (
                <label key={w.id} className="demo-opt">
                  <input type="checkbox" checked={chosen.includes(w.id)} onChange={() => toggle(w.id)} />
                  <span>
                    {w.label} (on {n(w.cards)} cards)
                  </span>
                </label>
              ))}
            </fieldset>
            <table className="demo-table">
              <caption>A search for {chosen.length ? chosen.join(" and ") : "nothing"}</caption>
              <tbody>
                <tr>
                  <th scope="row">Cards opened by checking every card</th>
                  <td>{n(tried.scanCards)}</td>
                </tr>
                <tr>
                  <th scope="row">List entries read with the word lists</th>
                  <td>{n(tried.listEntries)}</td>
                </tr>
                <tr>
                  <th scope="row">Cards opened with the word lists</th>
                  <td>{n(tried.matches)}</td>
                </tr>
                <tr>
                  <th scope="row">Work to add one new card, without and with the lists</th>
                  <td>
                    {n(tried.addWithoutIndex)} and {n(tried.addWithIndex)} (its {n(CARDS.wordsPerCard)} words each go on a list)
                  </td>
                </tr>
              </tbody>
            </table>
            <p aria-live="polite">
              {chosen.includes("salt")
                ? "Salt is on most cards, so its list is long. A common word makes the lists heavy to read, though the answer after combining them is small. "
                : "The lists for rarer words are short, so reading them is quick. "}
              The lists make searching much cheaper and adding a card much dearer.
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
