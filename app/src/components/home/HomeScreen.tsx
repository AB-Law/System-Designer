import { useState } from "react";
import { backend } from "../../api";
import {
  ROADMAP,
  TOTAL_STEPS,
  allSteps,
  bestScore,
  continueTarget,
  countDone,
  firstNotDone,
  isStepDone,
  localSubmissions,
  statusFor,
} from "../../roadmap";
import { useStore } from "../../store";
import { HomeCohorts } from "./HomeCohorts";
import { HomeShares } from "./HomeShares";

const FILTERS = ["all", "easy", "medium", "hard"] as const;
const STATUS: Record<string, string> = { done: "Done", in_progress: "In progress", next: "Recommended next", not_started: "Not started" };
const BANNER_KEY = "dc-home-banner-dismissed";

function bannerDismissed() {
  try {
    return localStorage.getItem(BANNER_KEY) === "1";
  } catch {
    return false;
  }
}

export function HomeScreen() {
  const problems = useStore((s) => s.problems);
  const user = useStore((s) => s.user);
  const setAuthOpen = useStore((s) => s.setAuthOpen);
  const setView = useStore((s) => s.setView);
  const start = useStore((s) => s.startRoadmapStep);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");

  const done = countDone();
  const pct = TOTAL_STEPS ? Math.round((done / TOTAL_STEPS) * 100) : 0;
  const nextId = firstNotDone();
  const target = continueTarget();
  const targetTitle = problems.find((p) => p.id === target)?.title ?? target;
  const fresh = done === 0 && !problems.some((p) => localSubmissions(p.id).length > 0);
  const titleOf = (id: string) => problems.find((p) => p.id === id)?.title ?? id;
  const upNext = allSteps()
    .filter(({ step }) => !isStepDone(localSubmissions(step.problemId)))
    .slice(0, 3);
  // problems in roadmap order, grouped by stage, numbered along the whole path
  const stages = ROADMAP.map((stage) => ({
    stage,
    items: allSteps()
      .filter((s) => s.stage.id === stage.id)
      .flatMap(({ step, index }) => {
        const p = problems.find((q) => q.id === step.problemId);
        return p && (filter === "all" || p.difficulty === filter) ? [{ p, index }] : [];
      }),
  })).filter((s) => s.items.length > 0);
  const count = (f: (typeof FILTERS)[number]) => (f === "all" ? problems.length : problems.filter((p) => p.difficulty === f).length);
  const [hidden, setHidden] = useState(bannerDismissed);
  // the signed-in note stays useful; only the guest/offline nudge can be dismissed
  const showBanner = !hidden;
  const dismissBanner = () => {
    setHidden(true);
    try {
      localStorage.setItem(BANNER_KEY, "1");
    } catch {
      /* private mode: dismissal lasts for this visit */
    }
  };

  return (
    <div className="home">
      <div className="home-in">
        <header className="home-hero">
          <div>
            <p className="home-kicker">System design practice</p>
            <h1>Build it, break it, learn why.</h1>
            <p className="home-sub">
              Drag blocks onto a canvas, connect them, and run the simulator against real traffic, spikes and failures. Each problem tells
              you what held, what broke and why.
            </p>
            <div className="home-cta">
              <button className="btn primary lg" onClick={() => void start(target)}>
                {fresh ? "Start with " : "Continue · "}
                {targetTitle}
              </button>
              <button className="btn lg" onClick={() => setView("roadmap")}>
                Open the learning roadmap
              </button>
            </div>
          </div>
          <div className="home-progress" role="group" aria-label={`${done} of ${TOTAL_STEPS} problems done`}>
            <span className="home-progress-num">
              {done}
              <i>/{TOTAL_STEPS}</i> done
            </span>
            <span className="home-progress-bar" aria-hidden="true">
              <i style={{ width: `${pct}%` }} />
            </span>
            <small>Done means every scenario scores 80 or more.</small>
          </div>
        </header>

        {showBanner && (
          <section className={"home-account" + (user ? " in" : "")}>
            {!backend.online ? (
              <p>
                <b>Running on its own.</b> Your work is saved in this browser. Accounts, share links and cohorts need the Design Canvas
                server.
              </p>
            ) : user ? (
              <p>
                <b>Signed in as {user.username}.</b> Your designs, versions and scores are saved to your account and follow you to other
                devices.
              </p>
            ) : (
              <>
                <p>
                  <b>Guest mode.</b> Your work stays in this browser. An invite-only account keeps it across devices.
                </p>
                <button className="btn" onClick={() => setAuthOpen(true)}>
                  Have an invite? Sign in
                </button>
              </>
            )}
            <button className="home-x" aria-label="Dismiss this message" onClick={dismissBanner}>
              ×
            </button>
          </section>
        )}

        <section>
          <div className="home-h">
            <h2>Problems</h2>
            {!user && backend.online && hidden && (
              <button className="link" onClick={() => setAuthOpen(true)}>
                Have an invite? Sign in
              </button>
            )}
            <div className="chips" role="group" aria-label="Filter by difficulty">
              {FILTERS.map((f) => (
                <button
                  key={f}
                  className={"chipbtn" + (filter === f ? " on" : "")}
                  aria-pressed={filter === f}
                  onClick={() => setFilter(f)}
                >
                  {f === "all" ? "All" : f[0].toUpperCase() + f.slice(1)} <span className="chip-n">{count(f)}</span>
                </button>
              ))}
            </div>
          </div>
          {upNext.length > 0 && filter === "all" && (
            <div className="home-next">
              <h3>Recommended next</h3>
              <div className="home-next-row">
                {upNext.map(({ step, index }) => (
                  <button key={step.problemId} className="home-next-item" onClick={() => void start(step.problemId)}>
                    <span className="home-step">{index}</span>
                    <span>{titleOf(step.problemId)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {stages.map(({ stage, items }) => (
            <div key={stage.id} className="home-stage">
              <div className="home-stage-h">
                <h3>{stage.title}</h3>
                <button className="link" onClick={() => setView("roadmap")}>
                  See this stage in the roadmap
                </button>
              </div>
              <div className="home-grid">
                {items.map(({ p, index }) => {
                  const subs = localSubmissions(p.id);
                  const status = statusFor(p.id, nextId, subs);
                  const best = bestScore(subs);
                  return (
                    <button key={p.id} className={`pcard status-${status}`} onClick={() => void start(p.id)}>
                      <span className="pcard-top">
                        <span className="home-step">{index}</span>
                        <span className={`diff ${p.difficulty}`}>{p.difficulty}</span>
                      </span>
                      <b className="pcard-title">{p.title}</b>
                      <span className="pcard-brief">{p.brief.split(/(?<=[.!?])\s/)[0]}</span>
                      <span className="pcard-foot">
                        <span className={`rm-status-pill ${status}`}>{STATUS[status]}</span>
                        {best !== null && <span className="rm-score">Best {best}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </section>

        {user && backend.online && (
          <div className="home-two">
            <HomeCohorts />
            <HomeShares />
          </div>
        )}
      </div>
    </div>
  );
}
