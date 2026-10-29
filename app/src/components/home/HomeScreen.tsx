import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { backend } from "../../api";
import { pullAllDesigns } from "../../cloud/sync";
import { hasLessons } from "../../lessons/load";
import { ROADMAP, TOTAL_STEPS, allSteps, continueTarget, countDone, firstNotDone } from "../../roadmap";
import { useStore } from "../../store";
import { ROADMAP_HASH } from "../../store";
import "../../styles/design-home.css";
import { cardData, editedText, matches, passedLine, sortCards, type CardData, type Sort } from "./cardData";
import { DesignMap } from "./DesignMap";
import { mapFromDoc } from "./designMapModel";
import { HomeCohorts } from "./HomeCohorts";
import { HomeShares } from "./HomeShares";
import { useReveal } from "./motionHooks";
import { ProblemCard } from "./ProblemCard";
import type { Problem } from "../../types";

// The hero runs the simulator, which the canvas already ships as its own chunk, so it loads after the first paint instead of with it.
const HomeHero = lazy(() => import("./HomeHero").then((m) => ({ default: m.HomeHero })));

const FILTERS = ["all", "easy", "medium", "hard"] as const;
const SORTS: { id: Sort; label: string }[] = [
  { id: "path", label: "Path order" },
  { id: "difficulty", label: "Easiest first" },
  { id: "recent", label: "Recently edited" },
  { id: "score", label: "Best score" },
];
const BANNER_KEY = "dc-home-banner-dismissed";
const MODE_KEY = "dc-home-mode";
const TONES = ["gold", "navy", "green", "teal", "bronze"] as const;

const read = (k: string): string | null => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* private mode: the choice lasts for this visit */
  }
};

interface Item {
  p: Problem;
  index: number;
  d: CardData;
  stageId: string;
}

export function HomeScreen() {
  const problems = useStore((s) => s.problems);
  const user = useStore((s) => s.user);
  const setAuthOpen = useStore((s) => s.setAuthOpen);
  const setView = useStore((s) => s.setView);
  const start = useStore((s) => s.startRoadmapStep);
  const showLessons = useMemo(hasLessons, []);
  const root = useReveal<HTMLDivElement>();

  const [tick, setTick] = useState(0);
  const [mode, setMode] = useState<"path" | "grid">(() => (read(MODE_KEY) === "grid" ? "grid" : "path"));
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("path");
  const [bannerGone, setBannerGone] = useState(() => read(BANNER_KEY) === "1");
  const search = useRef<HTMLInputElement>(null);

  // work saved on another device arrives in one request, and the cards update when it does
  useEffect(() => {
    if (user) void pullAllDesigns().then((changed) => changed && setTick((t) => t + 1));
  }, [user]);

  // "/" jumps to the search box, as in the header's palette
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT") {
        e.preventDefault();
        search.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const nextId = firstNotDone();
  const done = countDone();
  // read straight from storage each render (21 small reads); `tick` re-renders when the account brings newer designs in
  void tick;
  const items: Item[] = allSteps().flatMap(({ stage, step, index }) => {
    const p = problems.find((q) => q.id === step.problemId);
    return p ? [{ p, index, stageId: stage.id, d: cardData(p.id, nextId) }] : [];
  });

  const recommended =
    items.find((i) => i.d.status === "next" || i.d.status === "not_started") ?? items.find((i) => i.p.id === continueTarget()) ?? items[0];
  const resume = [...items].filter((i) => i.d.status === "in_progress").sort((a, b) => (b.d.edited ?? 0) - (a.d.edited ?? 0))[0];

  const shown = items.filter((i) => (filter === "all" || i.p.difficulty === filter) && matches(i.p, query));
  const count = (f: (typeof FILTERS)[number]) => (f === "all" ? items.length : items.filter((i) => i.p.difficulty === f).length);
  const open = (id: string) => () => void start(id);
  const pick = (m: "path" | "grid") => {
    setMode(m);
    write(MODE_KEY, m);
  };

  const showBanner = !bannerGone && (!backend.online || !user);

  return (
    <div className="home dh" ref={root}>
      <div className="home-in dh-in">
        {showBanner && (
          <section className="dh-note">
            {!backend.online ? (
              <p>
                <b>Running on its own.</b> Your work is saved in this browser. Accounts, share links and cohorts need the Design Canvas
                server.
              </p>
            ) : (
              <>
                <p>
                  <b>Guest mode.</b> Your work stays in this browser. An invite-only account keeps it across devices.
                </p>
                <button type="button" className="btn" onClick={() => setAuthOpen(true)}>
                  Have an invite? Sign in
                </button>
              </>
            )}
            <button
              type="button"
              className="home-x"
              aria-label="Dismiss this message"
              onClick={() => {
                setBannerGone(true);
                write(BANNER_KEY, "1");
              }}
            >
              ×
            </button>
          </section>
        )}

        {recommended && (
          <Suspense fallback={<div className="dh-hero-skel" aria-hidden="true" />}>
            <HomeHero
              problem={recommended.p}
              done={done}
              total={TOTAL_STEPS}
              onOpen={open(recommended.p.id)}
              onLearn={showLessons ? () => setView("learn") : null}
            />
          </Suspense>
        )}

        {resume && (
          <section className="dh-resume" data-rv aria-label="Continue where you left off">
            <div className="dh-resume-thumb">
              {resume.d.doc && <DesignMap data={mapFromDoc(resume.d.doc)} variant="thumb" label={`Your design for ${resume.p.title}`} />}
            </div>
            <div className="dh-resume-text">
              <span className="dh-label">Continue where you left off</span>
              <h2>{resume.p.title}</h2>
              <p>
                {resume.d.blocks} block{resume.d.blocks === 1 ? "" : "s"}
                {resume.d.edited !== null && ` · ${editedText(resume.d.edited)}`}
                {resume.d.best !== null && ` · best ${resume.d.best}`}
                {passedLine(resume.d) && ` · ${passedLine(resume.d)}`}
              </p>
            </div>
            <button type="button" className="btn primary lg" onClick={open(resume.p.id)}>
              Continue
            </button>
          </section>
        )}

        <section className="dh-problems" aria-labelledby="dh-problems-h">
          <div className="dh-bar-row">
            <h2 id="dh-problems-h">Problems</h2>
            <div className="dh-toggle" role="group" aria-label="View">
              <button type="button" aria-pressed={mode === "path"} onClick={() => pick("path")}>
                Path
              </button>
              <button type="button" aria-pressed={mode === "grid"} onClick={() => pick("grid")}>
                Grid
              </button>
            </div>
          </div>
          <div className="dh-tools">
            <div className="dh-chips2" role="group" aria-label="Filter by difficulty">
              {FILTERS.map((f) => (
                <button key={f} type="button" className={filter === f ? "on" : ""} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                  {f === "all" ? "All" : f[0].toUpperCase() + f.slice(1)} <span>{count(f)}</span>
                </button>
              ))}
            </div>
            <label className="dh-search">
              <span className="sr-only">Search problems</span>
              <input ref={search} type="search" placeholder="Search problems" value={query} onChange={(e) => setQuery(e.target.value)} />
              <kbd>/</kbd>
            </label>
            {mode === "grid" && (
              <label className="dh-sort">
                <span className="sr-only">Sort</span>
                <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                  {SORTS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button type="button" className="dh-link" onClick={() => (window.location.hash = ROADMAP_HASH)}>
              Roadmap and glossary
            </button>
          </div>

          {shown.length === 0 ? (
            <p className="dh-empty">No problem matches. Try a different word, or clear the filter.</p>
          ) : mode === "grid" ? (
            <div className="dh-grid">
              {sortCards(shown, sort).map((i) => (
                <div key={i.p.id} data-rv>
                  <ProblemCard p={i.p} d={i.d} layout="tile" onOpen={open(i.p.id)} />
                </div>
              ))}
            </div>
          ) : (
            <div className="dh-path">
              {ROADMAP.map((stage, si) => {
                const rows = shown.filter((i) => i.stageId === stage.id);
                if (rows.length === 0) return null;
                const all = items.filter((i) => i.stageId === stage.id);
                const finished = all.filter((i) => i.d.status === "done").length;
                return (
                  <section key={stage.id} className={`dh-stage tone-${TONES[si % TONES.length]}`} aria-label={stage.title}>
                    <header className="dh-stage-h" data-rv>
                      <h3>{stage.title}</h3>
                      <p>{stage.blurb}</p>
                      <span>
                        {finished} of {all.length} done
                      </span>
                    </header>
                    <ol className="dh-route">
                      {rows.map((i) => (
                        <li key={i.p.id} className={`stop ${i.p.difficulty} ${i.d.status}`} data-rv>
                          <i className="stop-dot" aria-hidden="true" />
                          <ProblemCard p={i.p} d={i.d} layout="row" onOpen={open(i.p.id)} />
                        </li>
                      ))}
                    </ol>
                  </section>
                );
              })}
            </div>
          )}
        </section>

        {user && backend.online && (
          <details className="dh-collab">
            <summary>
              <span>Collaborate</span>
              <em>Cohorts and shared links</em>
            </summary>
            <div className="home-two">
              <HomeCohorts />
              <HomeShares />
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
