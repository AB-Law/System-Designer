import { useId, useState } from "react";
import { DemoFrame, Predict, Result } from "./parts";
import { OURS, THEIRS, reconcile, type Finding } from "./realTimeModels";
import { restart } from "./restart";

const GUESSES = [
  { id: "1", label: "1" },
  { id: "2", label: "2" },
  { id: "3", label: "3" },
  { id: "4", label: "4" },
];
const WORDS: Record<Finding, string> = {
  agree: "Agree",
  amount: "Both have it, but the amounts differ",
  "only-ours": "Only we have it",
  "only-theirs": "Only the provider has it",
  late: "Timing: after the cut-off, so on tomorrow's statement",
};
const gbp = (x?: number) => (x === undefined ? "none" : `£${x}`);
const needsLook = (finding: Finding) => finding !== "agree" && finding !== "late";

export function ReconcileDemo() {
  const lateBox = useId();
  const [guess, setGuess] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [allowLate, setAllowLate] = useState(true);

  const tried = reconcile(allowLate);
  const real = reconcile(true).filter((l) => needsLook(l.finding)).length;
  const shown = tried.filter((l) => needsLook(l.finding)).length;
  const reset = () => {
    setGuess(null);
    setRevealed(false);
    setAllowLate(true);
  };

  return (
    <DemoFrame
      title="Do the books agree?"
      model="teaching"
      assumptions={[
        "This is a teaching model, not the app's simulator. The payments, the amounts and the cut-off are invented.",
        "Payments are matched by their id. Real systems also match on time, account and currency, and handle fees and refunds.",
        "The model finds and names differences. It does not decide what to do about them: that is for a person, or for a rule they wrote.",
        "The app models reconciliation as a background job that uses capacity. It does not compare lists.",
      ]}
    >
      <p>
        At the end of the day, your payment system lists {OURS.length} payments and the card provider&apos;s statement lists {THEIRS.length}
        . A payment made after the provider&apos;s cut-off appears on tomorrow&apos;s statement.
      </p>
      <table className="demo-table">
        <caption>The two lists</caption>
        <thead>
          <tr>
            <th scope="col">Payment</th>
            <th scope="col">Our books</th>
            <th scope="col">The provider</th>
          </tr>
        </thead>
        <tbody>
          {reconcile(false).map((l) => (
            <tr key={l.id}>
              <th scope="row">
                {l.id}
                {OURS.find((p) => p.id === l.id)?.late ? " (after the cut-off)" : ""}
              </th>
              <td>{gbp(l.ours)}</td>
              <td>{gbp(l.theirs)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Predict
        question="How many of these payments are real problems that someone must look at?"
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
              <b>{guess === String(real) ? `Yes: ${real}.` : `${real}.`}</b> Four lines do not match, but one of them is only timing. The
              other three are a wrong amount, a charge we recorded that the provider never made, and a charge the provider made that we have
              no record of.
            </p>
            <div className="demo-try">
              <label htmlFor={lateBox} className="demo-opt">
                <input id={lateBox} type="checkbox" checked={allowLate} onChange={(e) => setAllowLate(e.target.checked)} />
                <span>Treat payments after the cut-off as timing</span>
              </label>
            </div>
            <table className="demo-table">
              <caption>What the check finds ({shown} to look at)</caption>
              <thead>
                <tr>
                  <th scope="col">Payment</th>
                  <th scope="col">Finding</th>
                </tr>
              </thead>
              <tbody>
                {tried.map((l) => (
                  <tr key={l.id}>
                    <th scope="row">{l.id}</th>
                    <td>{WORDS[l.finding]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p aria-live="polite">
              {allowLate
                ? "Timing is set aside to be checked again tomorrow. The rest go to a person to review, because a wrong guess about money makes a small error larger."
                : "Without allowing for the cut-off, a normal late payment looks like an error. The check would raise a false alarm every day."}
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
