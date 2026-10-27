import { BLURBS } from "../../shell/blurbs";
import { useModules } from "../../shell/useActiveModule";
import { useStore } from "../../store";
import "../../styles/landing.css";

const HOW = [
  { n: "1", title: "Learn and practise", text: "Build systems on the canvas and see what holds under load and failure." },
  { n: "2", title: "Prepare for a role", text: "Score your CV against a job, run mock interviews and keep flashcards for what you miss." },
  { n: "3", title: "See where you stand", text: "Your Hub shows how ready you are for each role you target, and what to do next." },
];

/** What the app is, for someone who has not signed in. Signing in lands on the Hub. */
export function Landing() {
  const setAuthOpen = useStore((s) => s.setAuthOpen);
  const setLandingSeen = useStore((s) => s.setLandingSeen);
  const modules = useModules().filter((m) => m.id !== "hub");

  return (
    <div className="landing">
      <div className="landing-in">
        <header className="landing-hero">
          <p className="home-kicker">System design interview prep</p>
          <h1>Get ready for the interview, not just the theory.</h1>
          <p className="landing-sub">
            One place to practise designing systems, prepare for the role you want, and track how ready you are. Sign-up is invite-only, so
            your work follows you across devices.
          </p>
          <div className="home-cta">
            <button type="button" className="btn primary lg" onClick={() => setAuthOpen(true)}>
              Sign in or create an account
            </button>
            <button type="button" className="btn lg" onClick={() => setLandingSeen(true)}>
              Try the Design Canvas as a guest
            </button>
          </div>
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
              <li key={m.id}>
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
