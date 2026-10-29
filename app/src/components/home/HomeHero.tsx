import { useEffect, useMemo, useState } from "react";
import { CountUp } from "../../ui/CountUp";
import type { Problem } from "../../types";
import { DesignMap } from "./DesignMap";
import { STARTER_MAP, starterDesign, takesFor } from "./heroDemo";
import { reducedMotion } from "./motionHooks";

const ROTATE_MS = 4200;

/**
 * The first screen shows the product: a starter design for the recommended problem (users, one server, one database), run through
 * the real simulator. The scenario chips switch between its outcomes, cycling by themselves until the visitor takes over.
 */
export function HomeHero({
  problem,
  done,
  total,
  onOpen,
  onLearn,
}: {
  problem: Problem;
  done: number;
  total: number;
  onOpen: () => void;
  onLearn: (() => void) | null;
}) {
  const takes = useMemo(() => takesFor(starterDesign(), problem), [problem]);
  const [at, setAt] = useState(0);
  const [touched, setTouched] = useState(false);

  useEffect(() => setAt(0), [problem.id]);
  useEffect(() => {
    if (touched || takes.length < 2 || reducedMotion()) return;
    const t = window.setTimeout(() => setAt((a) => (a + 1) % takes.length), ROTATE_MS);
    return () => window.clearTimeout(t);
  }, [at, touched, takes.length]);

  const take = takes[Math.min(at, takes.length - 1)];
  const bad = useMemo(() => new Set(take?.bad ?? []), [take]);
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <header className="dh-hero">
      <div className="dh-copy">
        <h1>Build it, break it, learn why.</h1>
        <p className="dh-sub">
          Drag blocks onto a canvas, connect them, and run the simulator against real traffic, spikes and failures. Each problem tells you
          what held, what broke and why.
        </p>
        <div className="dh-cta">
          <button type="button" className="btn primary lg" onClick={onOpen}>
            Open {problem.title}
          </button>
          {onLearn && (
            <button type="button" className="dh-link" onClick={onLearn}>
              Learn the building blocks
            </button>
          )}
        </div>
        <div className="dh-progress" role="group" aria-label={`${done} of ${total} problems done`}>
          <span className="dh-count">
            <b>
              <CountUp value={String(done)} />
            </b>{" "}
            of {total} done
          </span>
          <i className="dh-bar" aria-hidden="true">
            <i style={{ width: `${pct}%` }} />
          </i>
          <small>Done means every scenario scores 80 or more.</small>
        </div>
      </div>

      <figure className="dh-demo" data-ui>
        <figcaption>
          A starter design for <b>{problem.title}</b>: users, one server, one database. What breaks?
        </figcaption>
        <div className="dh-stage">
          <DesignMap
            data={STARTER_MAP}
            variant="hero"
            bad={bad}
            packets={!!take && take.served > 0}
            draw
            label="Users, a server and a database"
          />
        </div>
        {take && (
          <p className={`dh-result${take.pass ? " pass" : " fail"}`} role="status">
            <b>{take.served}% answered</b>
            <span>{take.latencyMs} ms</span>
            <span className="dh-why">{take.pass ? "This scenario holds." : (take.reason ?? "This scenario fails.")}</span>
          </p>
        )}
        <div className="dh-chips" role="group" aria-label="Scenario">
          {takes.map((t, i) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={i === at}
              className={`dh-chip${i === at ? " on" : ""}${t.pass ? " pass" : " fail"}`}
              onClick={() => {
                setTouched(true);
                setAt(i);
              }}
            >
              <i aria-hidden="true" />
              {t.title}
            </button>
          ))}
        </div>
      </figure>
    </header>
  );
}
