import { useState } from "react";
import { n } from "./format";
import { CRAWL, crawl, type CrawlMode } from "./mediaModels";
import { Choice, DemoFrame, Predict, Result, Slider } from "./parts";
import { restart } from "./restart";

const GUESSES = [
  { id: "5", label: "About 5 a second: its fair share" },
  { id: "12", label: "About 12 a second: its share of the addresses" },
  { id: "20", label: "20 a second: the crawler's full speed" },
  { id: "1", label: "About 1 a second" },
];

const MODES = [
  { id: "found", label: "One speed for the whole crawler, addresses in the order they were found" },
  { id: "shuffled", label: "One speed for the whole crawler, addresses mixed up" },
  { id: "perSite", label: "A speed limit for each site" },
];

const mins = (s: number) => (s < 120 ? `${n(s)} seconds` : `about ${(s / 60).toFixed(1)} minutes`);

export function PoliteCrawlDemo() {
  const [guess, setGuess] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [mode, setMode] = useState<CrawlMode>("found");
  const [perSite, setPerSite] = useState(2);

  const total = CRAWL.sites.reduce((a, s) => a + s.addresses, 0);
  const tried = crawl(mode, perSite);
  const reset = () => {
    setGuess(null);
    setRevealed(false);
    setMode("found");
    setPerSite(2);
  };

  return (
    <DemoFrame
      title="One limit, or one limit per site?"
      model="teaching"
      assumptions={[
        "This is a teaching model, not the app's simulator. The sites, the number of addresses and the speeds are invented.",
        `A site is assumed to cope comfortably with ${CRAWL.comfortable} requests a second. Real sites differ, and many say how fast they are willing to be asked.`,
        "The app has one global Rate Limiter block and no limit for each site. It checks that a design has a rate limiter, a queue and a cache for seen addresses, but it cannot check that the limit is per site. That part is judged by what you write.",
        "In the app the seen-address cache has its hit ratio capped at 0.45, so some seen addresses are fetched again. This model does not include that.",
      ]}
    >
      <p>
        A crawler has {n(total)} addresses to fetch: {CRAWL.sites.map((s) => `${n(s.addresses)} on ${s.label.toLowerCase()}`).join(", ")}.
        The crawler as a whole can make {CRAWL.globalPerSec} requests a second, and has one limit for the whole crawler. The big site&apos;s
        addresses were found first, so they come first.
      </p>
      <Predict
        question="At its worst, how many requests a second does the big site receive?"
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
              <b>{guess === "20" ? "Yes: 20 a second." : "It receives 20 a second."}</b> The global limit only caps the crawler. It does not
              say where the requests go, so while the big site&apos;s addresses come first, every request goes to it. That is four times
              what it copes with comfortably ({CRAWL.comfortable} a second).
            </p>
            <p>Now choose how the crawler holds itself back.</p>
            <Choice legend="How the crawler is limited" options={MODES} value={mode} onChange={(m) => setMode(m as CrawlMode)} />
            {mode === "perSite" && (
              <Slider
                label="Requests a second to any one site"
                value={perSite}
                min={1}
                max={20}
                step={1}
                onChange={setPerSite}
                text={`${perSite}`}
              />
            )}
            <table className="demo-table">
              <caption>The crawl</caption>
              <tbody>
                <tr>
                  <th scope="row">Time to fetch every address</th>
                  <td>{mins(tried.seconds)}</td>
                </tr>
                <tr>
                  <th scope="row">Most requests a second any one site sees</th>
                  <td>{n(tried.peakPerSite)}</td>
                </tr>
                <tr>
                  <th scope="row">Do the sites cope comfortably?</th>
                  <td>{tried.coping ? "Yes" : `No: over ${CRAWL.comfortable} a second`}</td>
                </tr>
              </tbody>
            </table>
            <p aria-live="polite">
              {mode === "perSite"
                ? "A limit for each site keeps every site within what it copes with, but the big site's addresses now set how long the crawl takes."
                : "A limit for the whole crawler is quick, but it protects no one site: the big site still takes far more than it can comfortably answer."}
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
