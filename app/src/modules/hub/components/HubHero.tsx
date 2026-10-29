import type { CSSProperties } from "react";
import { daysLeftText, overallReadiness, readinessTier, TIER_COLOR, TIER_WORD } from "../format";
import type { Summary } from "../types";
import { CountUp } from "../../../ui/CountUp";
import "../hero.css";

const EARLY_BELOW = 3;

/** Four plain counts under the title. The readiness figure takes the one data hue; the others are ink. */
export function HubTiles({ summary }: { summary: Summary }) {
  const { readiness, fit, target, streak } = summary;
  const overall = overallReadiness(readiness);
  const early = overall !== null && overall.topics < EARLY_BELOW;
  const tier = !overall ? "none" : early ? "early" : readinessTier(overall.score);
  const days = target?.daysLeft ?? null;
  const bar = { "--to": `${overall?.score ?? 0}%`, "--c": TIER_COLOR[tier] } as CSSProperties;

  const tiles = [
    {
      label: "Readiness",
      value: overall ? `${overall.score}%` : "–",
      caption: overall
        ? early
          ? `${TIER_WORD[tier]}, from ${overall.topics} topic${overall.topics === 1 ? "" : "s"}`
          : TIER_WORD[tier]
        : "Not enough data yet",
      hero: true,
    },
    {
      label: "CV fit",
      value: fit?.total != null ? String(fit.total) : "–",
      unit: fit?.total != null ? "/ 100" : undefined,
      caption: fit?.total != null ? "Against this job description" : "Score a CV to fill this",
    },
    {
      label: "Interview",
      value: days !== null && days >= 0 ? String(days) : "–",
      unit: days !== null && days >= 0 ? (days === 1 ? "day" : "days") : undefined,
      caption: days !== null && days >= 0 ? daysLeftText(days) : "No date set",
    },
    {
      label: "Streak",
      value: String(streak.days),
      unit: streak.days === 1 ? "day" : "days",
      caption: streak.days > 0 ? "Keep it going today" : "Practise to start one",
    },
  ];

  return (
    <section className="hub-tiles" aria-label="Where you stand">
      {tiles.map((t) => (
        <div key={t.label} className={"hub-stat" + (t.hero ? " hero" : "")} style={t.hero ? bar : undefined}>
          <span className="hub-stat-label">{t.label}</span>
          <span className="hub-stat-value">
            <CountUp value={t.value} />
            {t.unit && <small>{t.unit}</small>}
          </span>
          <span className="hub-stat-caption">{t.caption}</span>
          {t.hero && <i className="hub-stat-bar" aria-hidden="true" />}
        </div>
      ))}
    </section>
  );
}

/** The single best next move, large, with the one primary action. */
export function NextMove({ summary }: { summary: Summary }) {
  const next = summary.actions[0];
  if (!next) return null;
  return (
    <a className="hub-next" href={next.href}>
      <span className="hub-stat-label">Best next move</span>
      <strong>{next.title}</strong>
      <span className="hub-next-why">{next.why}</span>
      <span className="hub-go" aria-hidden="true">
        Go
      </span>
    </a>
  );
}
