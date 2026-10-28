import type { ReactNode } from "react";
import { BLURBS } from "../../shell/blurbs";
import { DESIGN } from "../../shell/registry";
import { goModule } from "../../shell/route";
import { useModules } from "../../shell/useActiveModule";
import { useStore } from "../../store";
import "../../styles/landing.css";
import { LandingDemo } from "./LandingDemo";

const HOW = [
  { n: "1", title: "Learn and practise", text: "Build systems on the canvas and see what holds under load and failure." },
  { n: "2", title: "Prepare for a role", text: "Score your CV against a job, run mock interviews and keep flashcards for what you miss." },
  { n: "3", title: "See where you stand", text: "Your Hub shows how ready you are for each role you target, and what to do next." },
];

/** A tiny static taste of each module, so the cards show the product rather than describe it. */
const PEEK: Record<string, ReactNode> = {
  design: (
    <>
      <i className="pk-box" />
      <i className="pk-line" />
      <i className="pk-box" />
      <i className="pk-line" />
      <i className="pk-box pk-bad" />
    </>
  ),
  cv: (
    <>
      <b>82%</b>
      <i className="pk-bar">
        <i style={{ width: "82%" }} />
      </i>
      <em>match</em>
    </>
  ),
  interview: (
    <>
      <i className="pk-bub">How would you scale this?</i>
      <i className="pk-bub pk-me">Cache reads, then shard.</i>
    </>
  ),
  study: (
    <>
      <i className="pk-card">CAP theorem</i>
      <em>due today</em>
    </>
  ),
};

/** What the app is, for someone who has not signed in. Signing in lands on the Hub. */
export function Landing() {
  const setAuthOpen = useStore((s) => s.setAuthOpen);
  const setLandingSeen = useStore((s) => s.setLandingSeen);
  const all = useModules();
  const modules = all.filter((m) => m.id !== "hub");

  return (
    <div className="landing">
      <div className="landing-in">
        <header className="landing-hero">
          <div className="landing-copy">
            <p className="home-kicker">Interview prep, end to end</p>
            <h1>
              Walk in <em>ready.</em>
            </h1>
            <p className="landing-sub">
              Design systems and break them, score your CV against the job, mock-interview for the role and drill what you miss. Your Hub
              shows how ready you are. Sign-up is invite-only, so your work follows you across devices.
            </p>
            <div className="home-cta">
              <button type="button" className="btn primary lg" onClick={() => setAuthOpen(true)}>
                Sign in or create an account
              </button>
              <button
                type="button"
                className="btn lg"
                onClick={() => {
                  setLandingSeen(true);
                  goModule(DESIGN, all);
                }}
              >
                Try the Design Canvas as a guest
              </button>
            </div>
          </div>
          <LandingDemo />
        </header>

        <section aria-labelledby="landing-how">
          <h2 id="landing-how">How it works</h2>
          <ol className="landing-how">
            {HOW.map((h) => (
              <li key={h.n}>
                <span className="landing-n" aria-hidden="true">
                  {h.n}
                </span>
                <strong>{h.title}</strong>
                <span>{h.text}</span>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="landing-what">
          <h2 id="landing-what">What is inside</h2>
          <ul className="landing-modules">
            {modules.map((m) => (
              <li key={m.id} className={`lm lm-${m.id}`}>
                <span className="lm-peek" aria-hidden="true">
                  {PEEK[m.id]}
                </span>
                <strong>{BLURBS[m.id]?.title ?? m.title}</strong>
                <span>{BLURBS[m.id]?.blurb}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
