import type { CSSProperties } from "react";
import { daysLeftText, overallReadiness, readinessTier, TIER_COLOR, TIER_WORD } from "../format";
import type { Summary } from "../types";
import "../hero.css";

const EARLY_BELOW = 3;

/** The first thing on the Hub: one big readiness number, how long is left, and the single best next move. */
export function HubHero({ summary }: { summary: Summary }) {
  const { readiness, fit, actions, target } = summary;
  const overall = overallReadiness(readiness);
  const next = actions[0];
  if (!overall && !next) return null;

  // Same rule as the topic tiles: under three topics with evidence is an early read, not a verdict.
  const early = overall !== null && overall.topics < EARLY_BELOW;
  const tier = !overall ? "none" : early ? "early" : readinessTier(overall.score);
  const ring = { "--to": overall?.score ?? 0, "--c": TIER_COLOR[tier] } as CSSProperties;
  const days = target?.daysLeft ?? null;

  return (
    <section className="hub-hero" aria-label="Your readiness">
      <div
        className="hub-ring"
        style={ring}
        role="img"
        aria-label={overall ? `${overall.score} percent ready, ${TIER_WORD[tier]}` : "Not enough data yet"}
      >
        <b aria-hidden="true">{overall ? "" : "–"}</b>
      </div>
      <div className="hub-hero-body">
        <div className="hub-label">Overall readiness</div>
        <h3 className="hub-hero-state" style={{ color: TIER_COLOR[tier] }}>
          {overall ? TIER_WORD[tier] : "Not enough data yet"}
        </h3>
        <p className="hub-muted">
          {overall
            ? early
              ? `Based on ${overall.topics} topic${overall.topics === 1 ? "" : "s"} so far. Practise a few more to firm this up.`
              : `Average of ${overall.topics} topics with evidence.`
            : "Answer a few flashcards or run a mock interview round and this fills in."}
        </p>
        <div className="hub-chips">
          {days !== null && days >= 0 && <span className="hub-chip">Interview {daysLeftText(days)}</span>}
          {fit?.total != null && <span className="hub-chip">CV fit {fit.total}/100</span>}
          {summary.streak.days > 0 && <span className="hub-chip">{summary.streak.days} day streak</span>}
        </div>
      </div>
      {next && (
        <a className="hub-next" href={next.href}>
          <span className="hub-label">Best next move</span>
          <strong>{next.title}</strong>
          <span className="hub-muted">{next.why}</span>
          <span className="hub-go" aria-hidden="true">
            Go →
          </span>
        </a>
      )}
    </section>
  );
}
