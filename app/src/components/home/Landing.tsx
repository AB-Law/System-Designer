import { Suspense, lazy, useEffect, useRef, useState, type CSSProperties } from "react";
import { BLURBS } from "../../shell/blurbs";
import { DESIGN } from "../../shell/registry";
import { goModule } from "../../shell/route";
import { useModules } from "../../shell/useActiveModule";
import { useStore } from "../../store";
import "../../styles/landing.css";
import { HeroSystem, useIncident } from "./HeroSystem";
import { CvFragment, DesignFragment, InterviewFragment, StudyFragment } from "./LandingFragments";
import { useMagnet, useReveal } from "./motionHooks";
import { PUBLIC_LESSONS } from "./publicPages";

// Below the first screen and heavy with drawing, so they load after it instead of with it.
const TrafficScene = lazy(() => import("./TrafficScene").then((m) => ({ default: m.TrafficScene })));
const LandingPictures = lazy(() => import("./LandingPictures").then((m) => ({ default: m.LandingPictures })));

/** Each capability is a sentence with a switch. On, the band shows what it does in figures and opens the module. */
const BANDS = [
  {
    id: "design",
    on: true,
    sentence: "Build it, then break it under live traffic.",
    result: "A spike to 12,000 requests a second finds the database first.",
    tone: "gold",
  },
  {
    id: "cv",
    on: false,
    sentence: "Score your CV against the job.",
    result: "71 out of 100, with the three gaps to close first.",
    tone: "navy",
  },
  {
    id: "interview",
    on: true,
    sentence: "Mock-interview for the role.",
    result: "Every answer gets a score and the one thing to fix.",
    tone: "green",
  },
  {
    id: "study",
    on: false,
    sentence: "Drill what you miss, on schedule.",
    result: "Eleven cards due today, about four minutes.",
    tone: "teal",
  },
] as const;

/** What each capability looks like, shown inside its band when the switch is on. */
const BAND_FRAGMENT = {
  design: <DesignFragment />,
  cv: <CvFragment />,
  interview: <InterviewFragment />,
  study: <StudyFragment />,
} as const;

const STAGES = [
  {
    id: "design",
    name: "Build",
    clause: "First, build the system.",
    why: "Drag blocks onto a canvas and run traffic, spikes and failures through them. Each scenario says what held and what broke.",
    fragment: <DesignFragment />,
  },
  {
    id: "cv",
    name: "Score",
    clause: "Then score your CV.",
    why: "Paste the job description and see how your CV reads against it, with the gaps ranked so you close the biggest first.",
    fragment: <CvFragment />,
  },
  {
    id: "interview",
    name: "Answer",
    clause: "Then answer the questions.",
    why: "An interviewer in character asks one question at a time, then marks each answer and names the one thing to fix.",
    fragment: <InterviewFragment />,
  },
  {
    id: "study",
    name: "Drill",
    clause: "Then drill what you miss.",
    why: "What you got wrong becomes flashcards that come back on a schedule, a little each day, until they stick.",
    fragment: <StudyFragment />,
  },
] as const;

/** Eases a number toward its target, so the headline gauge sweeps from 0 on load and glides whenever a server breaks. */
function useTween(target: number) {
  const [v, setV] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setV(target);
      return;
    }
    const start = from.current;
    const first = start === 0 && target > 0;
    const t0 = performance.now() + (first ? 450 : 0);
    const ms = first ? 1500 : 600;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, Math.max(0, (now - t0) / ms));
      const next = start + (target - start) * (1 - Math.pow(1 - p, 4));
      from.current = next;
      setV(next);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return Math.round(v);
}

/** What the app is, for someone who has not signed in. Signing in lands on the Hub. */
export function Landing() {
  const setAuthOpen = useStore((s) => s.setAuthOpen);
  const setLandingSeen = useStore((s) => s.setLandingSeen);
  const all = useModules();
  const root = useReveal();
  const sys = useIncident();
  const gauge = useTween(sys.served);
  const magCta = useMagnet<HTMLButtonElement>();
  const magGuest = useMagnet<HTMLButtonElement>();
  const magStage = useMagnet<HTMLButtonElement>();
  const magSign = useMagnet<HTMLButtonElement>();
  const magTry = useMagnet<HTMLButtonElement>();
  const [on, setOn] = useState<ReadonlySet<string>>(new Set(BANDS.filter((b) => b.on).map((b) => b.id)));
  const [stage, setStage] = useState(0);

  const guest = () => {
    setLandingSeen(true);
    goModule(DESIGN, all);
  };
  const open = (id: string) => (id === "design" ? guest() : setAuthOpen(true));
  const flip = (id: string) =>
    setOn((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <main className="landing" ref={root}>
      <header className="lp-hero">
        <h1 className="hero-line" style={{ "--served": `${gauge}%` } as CSSProperties}>
          <span className="w">
            <span className="w-in" style={{ "--d": "0ms" } as CSSProperties}>
              Walk in
            </span>
          </span>
          <span className="hl-slot" data-ui role="img" aria-label={`Readiness ${sys.served} percent`}>
            <i className="hl-fill" />
            <b>{gauge}%</b>
          </span>
          <span className="w">
            <span className="w-in" style={{ "--d": "260ms" } as CSSProperties}>
              ready.
            </span>
          </span>
        </h1>
        <HeroSystem sys={sys} />
        <div className="hero-foot">
          <p>
            Interview prep, end to end. Design systems and break them, score your CV against the job, mock-interview for the role and drill
            what you miss. Sign-up is invite-only, so your work follows you across devices.
          </p>
          <div className="hero-cta">
            <button type="button" ref={magCta} className="btn primary lg" onClick={() => setAuthOpen(true)}>
              Sign in or create an account
            </button>
            <button type="button" ref={magGuest} className="hero-link" onClick={guest}>
              Try the Design Canvas as a guest
            </button>
          </div>
        </div>
      </header>

      <Suspense fallback={<div className="lp-later" aria-hidden="true" />}>
        <TrafficScene onTry={guest} />
        <LandingPictures />
      </Suspense>

      <section className="lp-bands" aria-label="What is inside">
        {BANDS.map((b) => {
          const isOn = on.has(b.id);
          return (
            <div key={b.id} className={`lp-band tone-${b.tone}${isOn ? " is-on" : ""}`} data-rv>
              <div className="band-text">
                <p className="band-sentence">{b.sentence}</p>
                <p className="band-result" aria-hidden={!isOn}>
                  {b.result}{" "}
                  <button type="button" className="band-open" tabIndex={isOn ? 0 : -1} onClick={() => open(b.id)}>
                    {b.id === "design" ? "Open as a guest" : "Sign in to open"}
                  </button>
                </p>
              </div>
              <div className="band-frag" aria-hidden={!isOn}>
                {BAND_FRAGMENT[b.id]}
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={isOn}
                aria-label={BLURBS[b.id]?.title ?? b.id}
                className="lp-switch"
                data-ui
                onClick={() => flip(b.id)}
              >
                <i />
              </button>
            </div>
          );
        })}
      </section>

      <section className="lp-stages" aria-label="How it works">
        <div className="stages-left">
          <div className="stage-copy" key={stage} aria-live="polite">
            <p className="stage-clause">{STAGES[stage].clause}</p>
            <p className="stage-why">{STAGES[stage].why}</p>
            <button type="button" ref={magStage} className="btn primary lg" onClick={() => open(STAGES[stage].id)}>
              {STAGES[stage].id === "design" ? "Open as a guest" : "Sign in to open"}
            </button>
          </div>
        </div>
        <div className="stages-right">
          <div className="stage-frag" key={stage}>
            {STAGES[stage].fragment}
          </div>
        </div>
        <div className="stages-track">
          <input
            type="range"
            min={0}
            max={STAGES.length - 1}
            step={1}
            value={stage}
            aria-label="Stage"
            aria-valuetext={STAGES[stage].name}
            onChange={(e) => setStage(Number(e.target.value))}
            style={{ "--p": `${(stage / (STAGES.length - 1)) * 100}%` } as CSSProperties}
          />
          <ol>
            {STAGES.map((s, i) => (
              <li key={s.name} className={i === stage ? "now" : ""}>
                <button type="button" onClick={() => setStage(i)}>
                  {s.name}
                </button>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="lp-read" aria-labelledby="read-h">
        <h2 id="read-h" data-rv>
          Read first. No account needed.
        </h2>
        <div className="read-table" data-rv>
          <p className="read-word">Lessons</p>
          <ul>
            {PUBLIC_LESSONS.map((l) => (
              <li key={l.slug} data-rv style={{ "--d": `${PUBLIC_LESSONS.indexOf(l) * 70}ms` } as CSSProperties}>
                <a href={`/learn/${l.slug}/`}>
                  <span>{l.title}</span>
                  <em>{l.minutes} min</em>
                </a>
              </li>
            ))}
            <li className="gap">
              <a href="/problems/">
                <span>Twenty-one interview problems</span>
                <em>Briefs</em>
              </a>
            </li>
          </ul>
        </div>
      </section>

      <section className="lp-close" aria-labelledby="close-h">
        <h2 id="close-h" data-rv>
          Your turn.{" "}
          <button type="button" ref={magSign} className="inline-btn" onClick={() => setAuthOpen(true)}>
            Sign in
          </button>{" "}
          or{" "}
          <button type="button" ref={magTry} className="inline-btn ghost" onClick={guest}>
            try it as a guest
          </button>
          .
        </h2>
      </section>

      <footer className="lp-foot">
        <div className="foot-top">
          <p>Interview prep, end to end.</p>
          <p>Invite-only accounts. Guests keep their work in this browser.</p>
          <a href="/learn/">Learn</a>
          <a href="/problems/">Problems</a>
        </div>
        <p className="foot-credits">
          Pictures and footage, all via Wikimedia Commons, licensed CC BY-SA 4.0:{" "}
          <a href="https://commons.wikimedia.org/wiki/File:Wisconsin_Bell_Telephone_Company_Switchboard.jpg">
            Wisconsin Bell Telephone Company Switchboard
          </a>{" "}
          by Gary Langebartels / FortepanIowa;{" "}
          <a href="https://commons.wikimedia.org/wiki/File:Inside_a_card_catalog_at_the_Indiana_State_Library_-_ask_the_librarian.jpg">
            Inside a card catalog at the Indiana State Library
          </a>{" "}
          by TBurmeister (WMF);{" "}
          <a href="https://commons.wikimedia.org/wiki/File:2018_Vote_by_mail_envelopes_being_sorted_in_Santa_Clara_County.webm">
            Vote by mail envelopes being sorted in Santa Clara County
          </a>{" "}
          by Legoktm.
        </p>
        <p className="foot-mark" aria-hidden="true" data-rv>
          Design Canvas
        </p>
      </footer>
    </main>
  );
}
