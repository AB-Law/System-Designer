import type { CSSProperties } from "react";
import { go } from "../route";
import type { StudyStats } from "../types";
import "../study-woah.css";

const SECONDS_PER_CARD = 20;

/** The Study landing: how many cards are due today as one big number, and the one button that starts them. */
export function StudyHero({ stats }: { stats: StudyStats }) {
  const due = stats.dueToday;
  const minutes = Math.max(1, Math.round((due * SECONDS_PER_CARD) / 60));
  const retention = stats.retention == null ? null : Math.round(stats.retention * 100);

  return (
    <section className="st-hero" aria-label="Today">
      <div className="st-hero-main">
        <div className="st-kicker">Due today</div>
        <div className="st-due" style={{ "--to": due } as CSSProperties} role="img" aria-label={`${due} cards due today`} />
        <p className="st-muted">
          {due > 0
            ? `About ${minutes} minute${minutes === 1 ? "" : "s"}. Little and often beats a long session.`
            : "You are all caught up. Come back tomorrow."}
        </p>
        <button type="button" className="st-go" disabled={due === 0} onClick={() => go({ name: "review", deckId: null })}>
          {due > 0 ? "Start review" : "Nothing due"}
        </button>
      </div>
      <ul className="st-hero-side">
        <li>
          <b>{stats.streak}</b>
          <span>day streak</span>
        </li>
        <li>
          {retention === null ? (
            <b>–</b>
          ) : (
            <b className="st-ring" style={{ "--to": retention } as CSSProperties}>
              <i>{retention}%</i>
            </b>
          )}
          <span>retention</span>
        </li>
      </ul>
    </section>
  );
}
