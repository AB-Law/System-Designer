import { useState } from "react";
import { SHOP, SHOP_INDEXES, shop } from "./dataModels";
import { dollars, n, pct } from "./format";
import { DemoFrame, Predict, Result, Slider } from "./parts";
import { restart } from "./restart";

const GUESSES = [
  { id: "2", label: "About 2 times as much work as the best plan" },
  { id: "10", label: "About 10 times as much" },
  { id: "100", label: "About 100 times as much" },
  { id: "1000", label: "About 1,000 times as much" },
];

export function QueryPlanDemo() {
  const [guess, setGuess] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const [share, setShare] = useState(Math.round(SHOP.writeShare * 100));

  const none = shop([]);
  const tried = shop(chosen, share / 100);
  const limit = tried.served >= 0.999 ? null : tried.readLimit < tried.writeLimit ? "reads" : "writes";
  const reset = () => {
    setGuess(null);
    setRevealed(false);
    setChosen([]);
    setShare(Math.round(SHOP.writeShare * 100));
  };
  const toggle = (id: string) => setChosen(chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id]);

  return (
    <DemoFrame
      title="How much work is one question?"
      model="analyze"
      assumptions={[
        "The shop, its million orders and its traffic are invented for the lesson. The way the database turns a question and its indexes into work is the Design Canvas's own.",
        "Work is counted in lookup units: finding one order by its number is about 1. A scan reads a row for a thousandth of that, an index fetch a row for a two-hundredth, and sorting a row in memory for a five-hundredth.",
        "Real databases have many more kinds of plan, and keep statistics to choose between them. The app picks the cheapest of the plans it knows.",
        "Each index makes every order a little dearer to take. The app puts that at 0.4 of a lookup per index, and allows six indexes at most.",
      ]}
    >
      <p>
        A town shop keeps {n(SHOP.rows)} orders in one table. A customer asks for their three latest. The database has no index except the
        order number, so this question has nothing to jump to.
      </p>
      <Predict
        question="How much more work is it to answer that question with no index than with the best possible plan?"
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
              <b>{guess === "1000" ? "Yes: about 1,000 times." : "It is about 1,000 times as much."}</b> The database{" "}
              {none.plan.charAt(0).toLowerCase() + none.plan.slice(1)}: about {n(none.readUnits)} units of work, against about{" "}
              {none.bestUnits.toFixed(1)} for the best plan. The shop cannot serve its {n(SHOP.rps)} requests a second this way: it serves{" "}
              {pct(none.served)}.
            </p>
            <p>Now add indexes. Choose the ones the question needs, and watch what they cost.</p>
            <fieldset className="demo-try">
              <legend>Indexes</legend>
              {SHOP_INDEXES.map((i) => (
                <label key={i.id} className="demo-opt">
                  <input type="checkbox" checked={chosen.includes(i.id)} onChange={() => toggle(i.id)} />
                  <span>{i.label}</span>
                </label>
              ))}
            </fieldset>
            <Slider
              label="Share of requests that take an order"
              value={share}
              min={0}
              max={60}
              step={1}
              onChange={setShare}
              text={`${share}%`}
            />
            <table className="demo-table">
              <caption>What the database does</caption>
              <tbody>
                <tr>
                  <th scope="row">Finding a customer&apos;s latest orders</th>
                  <td>{tried.plan}</td>
                </tr>
                <tr>
                  <th scope="row">Work for that question</th>
                  <td>
                    {tried.readUnits.toFixed(2)} units (best possible {tried.bestUnits.toFixed(2)})
                  </td>
                </tr>
                <tr>
                  <th scope="row">Work to take one order</th>
                  <td>{tried.writeUnits.toFixed(1)} units</td>
                </tr>
                <tr>
                  <th scope="row">Most reads and writes a second</th>
                  <td>
                    {n(tried.readLimit)} and {n(tried.writeLimit)}
                  </td>
                </tr>
              </tbody>
            </table>
            <p aria-live="polite">
              {pct(tried.served)} of requests are served
              {limit === "reads" ? ": the read limit is passed" : ""}
              {limit === "writes" ? ": the write limit is passed, and each index adds to the work of taking an order" : ""}. The database
              and its indexes cost about {dollars(tried.monthlyCost)} a month.
              {tried.why.length > 0 ? ` The plan is slower than it could be because it ${tried.why.join(" and ")}.` : ""}
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
