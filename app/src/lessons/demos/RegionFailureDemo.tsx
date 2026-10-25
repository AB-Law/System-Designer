import { useId, useState } from "react";
import { dollars, n, pct } from "./format";
import { Choice, DemoFrame, Predict, Result } from "./parts";
import { ALERTS, weatherAlerts, type Placement } from "./realTimeModels";
import { restart } from "./restart";

const GUESSES = [
  { id: "all", label: "Nearly all of them: the servers in Europe are still running" },
  { id: "most", label: "Most of them, as the European share is large" },
  { id: "some", label: "About two in five: the European share" },
  { id: "none", label: "Hardly any: the data is in the region that was lost" },
];
const PLACEMENTS = [
  { id: "one", label: "Everything in US East" },
  { id: "servers", label: "Servers in both regions, the data in US East only" },
  { id: "servers-and-data", label: "Servers in both regions, and a copy of the data in Europe" },
];

export function RegionFailureDemo() {
  const bigBox = useId();
  const [guess, setGuess] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [placement, setPlacement] = useState<Placement>("one");
  const [full, setFull] = useState(false);

  const servers = weatherAlerts("servers", true);
  const tried = weatherAlerts(placement, full);
  const reset = () => {
    setGuess(null);
    setRevealed(false);
    setPlacement("one");
    setFull(false);
  };

  return (
    <DemoFrame
      title="What survives when a region is lost?"
      model="analyze"
      assumptions={[
        "The weather-alert app and its traffic are invented for the lesson. The regions, the delays between them and the way a database copy takes over are the Design Canvas's own.",
        "When a region is lost, a database with a copy elsewhere switches to the copy at reduced capacity. How long the switch takes, and the last few writes that had not reached the copy yet, are not modelled.",
        "Users are connected to the server in each region, and the app sends them to a healthy one. Choosing which region a real user is sent to is not modelled.",
        "Each server is sized either for its own region's share of the traffic or for all of it.",
      ]}
    >
      <p>
        A weather-alert app gets {n(ALERTS.rps)} requests a second: {pct(ALERTS.mix.us)} from US East and {pct(ALERTS.mix.eu)} from Europe.
        Servers are running in both regions, but the database is only in US East. Then US East is lost.
      </p>
      <Predict
        question="What share of requests can still be served?"
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
              <b>{guess === "none" ? "Yes: hardly any." : "Hardly any."}</b> The servers in Europe are working, but every request needs data
              and the data was in US East. With the region lost, {pct(servers.downServed)} are served.
            </p>
            <p>Now choose where things run.</p>
            <Choice legend="Where things run" options={PLACEMENTS} value={placement} onChange={(id) => setPlacement(id as Placement)} />
            <div className="demo-try">
              <label htmlFor={bigBox} className="demo-opt">
                <input
                  id={bigBox}
                  type="checkbox"
                  checked={full}
                  onChange={(e) => setFull(e.target.checked)}
                  disabled={placement === "one"}
                />
                <span>Size each server to carry all the traffic ({n(ALERTS.bigServer)} a second), not only its region&apos;s share</span>
              </label>
            </div>
            <table className="demo-table">
              <caption>What this design does</caption>
              <tbody>
                <tr>
                  <th scope="row">Requests served on a normal day</th>
                  <td>{pct(tried.normalServed)}</td>
                </tr>
                <tr>
                  <th scope="row">Requests served when US East is lost</th>
                  <td>{pct(tried.downServed)}</td>
                </tr>
                <tr>
                  <th scope="row">A visitor in Europe waits, on a normal day</th>
                  <td>{n(tried.europeMs)} ms</td>
                </tr>
                <tr>
                  <th scope="row">Monthly cost</th>
                  <td>{dollars(tried.monthlyCost)}</td>
                </tr>
              </tbody>
            </table>
            <p aria-live="polite">
              {placement === "one"
                ? "With everything in one place, losing it loses everything, and Europeans wait for the ocean on every request."
                : placement === "servers"
                  ? "A server in Europe makes a normal day quicker for Europeans, but it has nothing to read when US East is gone."
                  : full
                    ? "With the data copied and each server able to carry everything, the second region takes over completely. That spare capacity is paid for all the time."
                    : "The copy takes over, but a server sized for its own region's share is overloaded once it receives everyone. Try sizing for all the traffic."}
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
