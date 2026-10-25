import { useId, useState } from "react";
import { dollars, n } from "./format";
import { Choice, DemoFrame, Predict, Result } from "./parts";
import { BUDGET, PLACEMENTS, STEPS, budget, type Handling } from "./realTimeModels";
import { restart } from "./restart";

const GUESSES = [
  { id: "165", label: "About 165 ms: the same as a normal day" },
  { id: "215", label: "About 215 ms" },
  { id: "750", label: "About 750 ms" },
  { id: "1200", label: "About 1,200 ms" },
];
const OPTIONAL = STEPS.filter((s) => !s.essential);
const START: Record<string, Handling> = { loyalty: "before", suggest: "before" };

export function BudgetDemo() {
  const badBox = useId();
  const [guess, setGuess] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [choice, setChoice] = useState<Record<string, Handling>>(START);
  const [bad, setBad] = useState(false);

  const allBefore = budget(START, true);
  const normal = budget(choice, false);
  const tried = budget(choice, bad);
  const reset = () => {
    setGuess(null);
    setRevealed(false);
    setChoice(START);
    setBad(false);
  };

  return (
    <DemoFrame
      title="Fit the time and the money"
      model="teaching"
      assumptions={[
        "This is a teaching model, not the app's simulator. The shop, the steps, their times and their costs are invented.",
        `The essential steps always run before the answer. A time limit of ${BUDGET.limitMs} ms cuts off a slow step, and what it would have said is thrown away.`,
        `Doing any step in the background needs a queue and a worker, which adds ${dollars(BUDGET.backgroundDollars)} a month. On a bad day each optional step takes ${BUDGET.badDayFactor} times as long.`,
        "The app adds up response time along the request path and the monthly cost of every block. It does not model the slowest few requests beyond what it already shows.",
      ]}
    >
      <p>
        A pizza shop&apos;s order page must answer within {BUDGET.ms} ms and cost no more than {dollars(BUDGET.dollars)} a month. Three
        steps are essential: check the stock, work out the price and save the order, together 50 ms. Two are optional: a loyalty discount
        (45 ms) and a suggested extra (70 ms). Right now both are done before answering.
      </p>
      <Predict
        question="On a bad day both optional steps take ten times as long. How long does the page take?"
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
              <b>{guess === "1200" ? "Yes: about 1,200 ms." : "About 1,200 ms."}</b> 50 ms for the essential steps, 450 for the discount and
              700 for the suggestion: {n(allBefore.ms)} ms. Optional steps that run before the answer decide how long everyone waits.
            </p>
            <p>Now decide where each optional step goes.</p>
            {OPTIONAL.map((s) => (
              <Choice
                key={s.id}
                legend={`${s.label} (${s.ms} ms, ${dollars(s.dollars)} a month)`}
                options={PLACEMENTS}
                value={choice[s.id]}
                onChange={(id) => setChoice({ ...choice, [s.id]: id as Handling })}
              />
            ))}
            <div className="demo-try">
              <label htmlFor={badBox} className="demo-opt">
                <input id={badBox} type="checkbox" checked={bad} onChange={(e) => setBad(e.target.checked)} />
                <span>Have a bad day: the optional steps take ten times as long</span>
              </label>
            </div>
            <table className="demo-table">
              <caption>{bad ? "On a bad day" : "On a normal day"}, against the budget</caption>
              <tbody>
                <tr>
                  <th scope="row">The customer waits</th>
                  <td>
                    {n(tried.ms)} ms: {tried.withinTime ? `within ${BUDGET.ms} ms` : `over ${BUDGET.ms} ms`}
                  </td>
                </tr>
                <tr>
                  <th scope="row">Monthly cost</th>
                  <td>
                    {dollars(tried.dollars)}: {tried.withinMoney ? `within ${dollars(BUDGET.dollars)}` : `over ${dollars(BUDGET.dollars)}`}
                  </td>
                </tr>
              </tbody>
            </table>
            <p aria-live="polite">
              {tried.withinTime && tried.withinMoney
                ? `Both budgets are met${bad ? ", even on a bad day" : ""}.`
                : !tried.withinTime && !tried.withinMoney
                  ? "Both budgets are broken."
                  : !tried.withinTime
                    ? "The time is over. Something slow is still sitting before the answer."
                    : "The time is met, but the money is over. Speed has a price: try leaving a step out."}
              {normal.withinTime && !tried.withinTime ? " This choice was fine on a normal day and broke on a bad one." : ""}
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
