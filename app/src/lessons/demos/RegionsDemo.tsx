import { useId, useState } from "react";
import { NOTICES, notices } from "./analyzeModels";
import { dollars, n, pct } from "./format";
import { DemoFrame, Predict, Result } from "./parts";
import { restart } from "./restart";

const GUESSES = [
  { id: "same", label: "About the same" },
  { id: "little", label: "A little slower (under one and a half times)" },
  { id: "several", label: "Several times slower" },
];
const LABEL = { us: "US East (home)", eu: "Europe", ap: "Asia Pacific" } as const;

export function RegionsDemo() {
  const serversBox = useId();
  const copiesBox = useId();
  const [guess, setGuess] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [servers, setServers] = useState(false);
  const [copies, setCopies] = useState(false);

  const home = notices(false, false);
  const tried = notices(servers, copies);
  const times = home.byRegion.ap / home.byRegion.us;
  const reset = () => {
    setGuess(null);
    setRevealed(false);
    setServers(false);
    setCopies(false);
  };

  return (
    <DemoFrame
      title="Where does the time go?"
      model="analyze"
      assumptions={[
        "The school-notices app and its numbers are invented. The Design Canvas has three regions with one fixed delay between each pair, and the demo uses them as they are.",
        "Those delays are the app's simplification. They are not a rule for how long a request takes in real life, which varies with the route and the time of day.",
        "The shape is what matters: distance adds delay to every call that crosses it, a copy of the data near the reader helps reads, and writes still go home.",
        "Keeping the copies up to date, and a copy being a moment behind, are not modelled.",
      ]}
    >
      <p>
        A school-notices app has readers in three places: {pct(NOTICES.mix.us)} in US East, {pct(NOTICES.mix.eu)} in Europe and{" "}
        {pct(NOTICES.mix.ap)} in Asia Pacific. Its server and its database are both in US East.
      </p>
      <Predict
        question="Compared with a parent in US East, how long does a parent in Asia Pacific wait for a page?"
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
              <b>{guess === "several" ? "Yes: several times slower." : "Several times slower, in the app's model."}</b> A parent in US East
              waits about {n(home.byRegion.us)} ms. A parent in Asia Pacific waits about {n(home.byRegion.ap)} ms, around {times.toFixed(0)}{" "}
              times as long, because the request has to cross the ocean to the server and the server's questions to the database stay at
              home.
            </p>
            <p>Now put things closer to the readers.</p>
            <div className="demo-try">
              <label htmlFor={serversBox} className="demo-opt">
                <input id={serversBox} type="checkbox" checked={servers} onChange={(e) => setServers(e.target.checked)} />
                <span>Run a server in each region</span>
              </label>
              <label htmlFor={copiesBox} className="demo-opt">
                <input id={copiesBox} type="checkbox" checked={copies} onChange={(e) => setCopies(e.target.checked)} />
                <span>Keep a read copy of the data in Europe and Asia Pacific</span>
              </label>
            </div>
            <table className="demo-table">
              <caption>What a reader waits for a page</caption>
              <thead>
                <tr>
                  <th scope="col">Reader in</th>
                  <th scope="col">Everything in US East</th>
                  <th scope="col">Your design</th>
                </tr>
              </thead>
              <tbody>
                {(["us", "eu", "ap"] as const).map((r) => (
                  <tr key={r}>
                    <th scope="row">{LABEL[r]}</th>
                    <td>about {n(home.byRegion[r])} ms</td>
                    <td>about {n(tried.byRegion[r])} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p aria-live="polite">
              {servers &&
                !copies &&
                "Servers in each region do not help on their own: they still ask the database in US East for every page. "}
              {!servers && copies && "A copy of the data does not help if the server asking for it is still far away. "}
              {servers && copies && "Reads are now answered near the reader, so every region waits about as long as US East. "}
              {!servers && !copies && "This is the starting design. "}
              Writes, such as posting a notice, still go to US East, so they take longer from far away. This design costs about{" "}
              {dollars(tried.monthlyCost)} a month.
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
