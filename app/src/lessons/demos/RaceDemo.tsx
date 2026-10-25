import { useEffect, useId, useRef, useState } from "react";
import { RACE, playRace } from "./raceModel";
import { DemoFrame, Predict, Result } from "./parts";
import { restart } from "./restart";

const GUESSES = [
  { id: "0", label: "0: both withdrawals count" },
  { id: "50", label: "50: one withdrawal is lost" },
  { id: "100", label: "100: neither counts" },
  { id: "-50", label: "−50: the account is overdrawn" },
];

export function RaceDemo() {
  const lockBox = useId();
  const [guess, setGuess] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [lock, setLock] = useState(false);
  const [shown, setShown] = useState(0);
  const finished = useRef<HTMLDivElement>(null);

  const play = playRace(lock);
  const done = shown >= play.steps.length;
  const wrong = done && play.finalBalance !== play.expected;
  useEffect(() => {
    if (done) finished.current?.focus();
  }, [done]);

  const reset = () => {
    setGuess(null);
    setRevealed(false);
    setLock(false);
    setShown(0);
  };

  return (
    <DemoFrame
      title="Two withdrawals at once"
      model="teaching"
      assumptions={[
        "This is a teaching model, not the app's simulator: one balance, two writers and one fixed order of steps.",
        "Real overlaps can happen in many orders. This is one that shows the problem clearly.",
        "The app does not play this out. It checks that a design has a lock where one is needed, and charges for the speed the lock costs.",
        "A lock protects an update to one value from being lost. It does not make a system able to handle huge numbers of writers.",
      ]}
    >
      <p>
        Two housemates share an account holding {RACE.start}. At the same moment, each withdraws {RACE.amount}. Each withdrawal reads the
        balance, works out the new one, and writes it back.
      </p>
      <Predict
        question="Nothing stops the two withdrawals overlapping. What does the account hold afterwards?"
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
              <b>{guess === "50" ? "Yes: 50." : "The account holds 50."}</b> Both housemates read 100 before either wrote. Each worked out
              100 − {RACE.amount}, and the second write replaced the first. {2 * RACE.amount} was handed out, but the balance fell by only{" "}
              {RACE.amount}.
            </p>
            <p>Step through it, with and without a lock.</p>
            <label htmlFor={lockBox} className="demo-opt">
              <input
                id={lockBox}
                type="checkbox"
                checked={lock}
                onChange={(e) => {
                  setLock(e.target.checked);
                  setShown(0);
                }}
              />
              <span>Use a lock on the balance</span>
            </label>
            <ol className="race-steps" aria-label="What happens, step by step">
              {play.steps.slice(0, shown).map((s, i) => (
                <li key={i}>
                  {s.text} <span className="muted">Balance: {s.balance}.</span>
                </li>
              ))}
            </ol>
            {!done && (
              <button type="button" className="btn" onClick={() => setShown(shown + 1)}>
                {shown === 0 ? "Start" : "Next step"}
              </button>
            )}
            <div ref={finished} tabIndex={-1} className="race-end" aria-live="polite">
              {done && (
                <p>
                  <b>
                    {wrong
                      ? `The account holds ${play.finalBalance}, but it should hold ${play.expected}.`
                      : `The account holds ${play.finalBalance}, as it should.`}
                  </b>{" "}
                  {wrong
                    ? "One withdrawal was lost."
                    : `Nothing was lost, but B had to wait: the lock made the second withdrawal take one step longer (${play.steps.length} steps instead of ${playRace(false).steps.length}).`}
                </p>
              )}
            </div>
            <button type="button" className="btn small" onClick={(e) => restart(e, reset)}>
              Try the question again
            </button>
          </Result>
        )}
      </div>
    </DemoFrame>
  );
}
