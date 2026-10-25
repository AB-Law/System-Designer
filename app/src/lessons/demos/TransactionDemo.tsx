import { useId, useState } from "react";
import { MOVE, moveMoney } from "./dataTeaching";
import { DemoFrame, Predict, Result } from "./parts";
import { restart } from "./restart";

const GUESSES = [
  { id: "300", label: "300: no money is lost" },
  { id: "250", label: "250: the 50 has vanished" },
  { id: "350", label: "350: the money is counted twice" },
  { id: "200", label: "200: the accounts are emptied" },
];

export function TransactionDemo() {
  const txBox = useId();
  const cutBox = useId();
  const [guess, setGuess] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [transaction, setTransaction] = useState(false);
  const [cut, setCut] = useState(true);

  const plain = moveMoney(false, true);
  const tried = moveMoney(transaction, cut);
  const reset = () => {
    setGuess(null);
    setRevealed(false);
    setTransaction(false);
    setCut(true);
  };

  return (
    <DemoFrame
      title="Both steps, or neither"
      model="teaching"
      assumptions={[
        "This is a teaching model, not the app's simulator: one database, two accounts and one move in two steps.",
        "The app does not play a power cut. It checks that a database set to the strongest setting (Serializable) is connected where a design needs several changes to succeed together, and charges for the writes being slower.",
        "A transaction on one database is simple. Changes across several services, or an outside provider, need more than this, and a later module returns to that.",
      ]}
    >
      <p>
        A person has {MOVE.savings} in savings and {MOVE.current} in their current account, {MOVE.savings + MOVE.current} in all. They move{" "}
        {MOVE.amount} from savings to current. That is two steps: take it out of savings, then put it into current. The power fails after
        the first step, and nothing groups the two steps together.
      </p>
      <Predict
        question="After the system restarts, how much do the two accounts hold together?"
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
              <b>{guess === "250" ? "Yes: 250." : "They hold 250."}</b> Savings is {plain.savings} and current is {plain.current}. The{" "}
              {MOVE.amount} left savings and never arrived. Nothing records that the second step was owed.
            </p>
            <p>Now group the steps, and change when the power fails.</p>
            <div className="demo-try">
              <label htmlFor={txBox} className="demo-opt">
                <input id={txBox} type="checkbox" checked={transaction} onChange={(e) => setTransaction(e.target.checked)} />
                <span>Group the two steps in a transaction</span>
              </label>
              <label htmlFor={cutBox} className="demo-opt">
                <input id={cutBox} type="checkbox" checked={cut} onChange={(e) => setCut(e.target.checked)} />
                <span>The power fails after the first step</span>
              </label>
            </div>
            <ol className="race-steps" aria-label="What happens, step by step">
              {tried.steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
            <p aria-live="polite">
              <b>
                Savings {tried.savings}, current {tried.current}: {tried.total} in all.
              </b>{" "}
              {tried.total === MOVE.savings + MOVE.current
                ? "No money was lost."
                : `${MOVE.savings + MOVE.current - tried.total} has gone missing.`}{" "}
              Someone adding up the balances halfway through the move would see {tried.auditHalfway}
              {transaction ? ", because the strongest setting makes them wait until the move is finished or undone." : "."} A stronger
              setting makes writes slower: the app charges for that on every write.
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
