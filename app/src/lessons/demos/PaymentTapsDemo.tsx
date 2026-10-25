import { useId, useState } from "react";
import { DemoFrame, Predict, Result, Slider } from "./parts";
import { FEE, payTaps } from "./realTimeModels";
import { restart } from "./restart";

const GUESSES = [
  { id: "12", label: "£12: once" },
  { id: "24", label: "£24: twice" },
  { id: "36", label: "£36: once for every tap" },
  { id: "0", label: "Nothing: the first tap hung, so nothing was charged" },
];
const gbp = (x: number) => (x < 0 ? `−£${-x}` : `£${x}`);

export function PaymentTapsDemo() {
  const keyBox = useId();
  const [guess, setGuess] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [taps, setTaps] = useState(FEE.taps);
  const [withKey, setWithKey] = useState(false);

  const plain = payTaps(FEE.taps, false);
  const tried = payTaps(taps, withKey);
  const reset = () => {
    setGuess(null);
    setRevealed(false);
    setTaps(FEE.taps);
    setWithKey(false);
  };

  return (
    <DemoFrame
      title="Tap, tap, tap"
      model="teaching"
      assumptions={[
        "This is a teaching model, not the app's simulator. The fee, the number of taps and the ledger are invented.",
        "Every tap reaches the processor, and the processor carries out each one it has not been told is the same payment. In real systems a retry can arrive while the first is still running, which needs more care.",
        "The ledger is a list of lines that are only added. Each charge adds one line out of the customer and one into the gym.",
        "The app treats a key as a setting on a server or a worker, and checks that it is set. It does not send duplicate requests.",
      ]}
    >
      <p>
        You tap Pay on a £{FEE.pounds} gym fee. The screen hangs, so you tap {FEE.taps - 1} more times. All {FEE.taps} taps reach the
        payment system, and the system does not use a key to recognise a repeat.
      </p>
      <Predict
        question="How much does your card pay?"
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
              <b>{guess === "36" ? `Yes: £${plain.customerOut}.` : `£${plain.customerOut}.`}</b> The system cannot tell a repeat from a new
              payment, so each tap is carried out. A hung screen does not mean a failed payment: it can mean a lost reply.
            </p>
            <p>Now add a key, and change how many times you tap.</p>
            <div className="demo-try">
              <label htmlFor={keyBox} className="demo-opt">
                <input id={keyBox} type="checkbox" checked={withKey} onChange={(e) => setWithKey(e.target.checked)} />
                <span>Send the same key with every tap, and remember the result</span>
              </label>
            </div>
            <Slider label="Times you tap" value={taps} min={1} max={5} step={1} onChange={setTaps} text={`${taps}`} />
            <table className="demo-table">
              <caption>
                The ledger after {taps} {taps === 1 ? "tap" : "taps"}, {withKey ? "with" : "without"} a key
              </caption>
              <thead>
                <tr>
                  <th scope="col">Line</th>
                  <th scope="col">Account</th>
                  <th scope="col">Amount</th>
                </tr>
              </thead>
              <tbody>
                {tried.ledgerLines.map((l, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td>{l.who}</td>
                    <td>{gbp(l.pounds)}</td>
                  </tr>
                ))}
                <tr>
                  <th scope="row" colSpan={2}>
                    All the lines add up to
                  </th>
                  <td>{gbp(tried.lineTotal)}</td>
                </tr>
              </tbody>
            </table>
            <p aria-live="polite">
              {withKey
                ? `The first tap was carried out. The others were told its result, so you paid ${gbp(tried.customerOut)} once.`
                : `You paid ${gbp(tried.customerOut)} for ${tried.charges} ${tried.charges === 1 ? "charge" : "charges"}.`}{" "}
              The lines always add up to nothing, because money out of one account is money into another. A mistake is fixed by adding
              lines, not by editing.
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
