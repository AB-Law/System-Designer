import { Card } from "../../../ui/Card";
import { barWidth, dataPoints, moduleName, TIER_COLOR, TIER_WORD } from "../format";
import type { TopicCard } from "../types";

function Tile({ t }: { t: TopicCard }) {
  const color = TIER_COLOR[t.tier];
  return (
    <li className={"hub-tile" + (t.tier === "none" ? " hub-tile-empty" : "")}>
      <div className="hub-tile-head">
        <strong>{t.label}</strong>
        <span style={{ color }}>{TIER_WORD[t.tier]}</span>
      </div>
      <div className="hub-bar" aria-hidden="true">
        <div style={{ width: barWidth(t.strength, t.tier), background: color }} />
      </div>
      <div className="hub-muted">
        {dataPoints(t.points)}
        {t.sources.length > 0 && ` · ${t.sources.map(moduleName).join(", ")}`}
        {t.relevant && " · in this job description"}
      </div>
    </li>
  );
}

export function ReadinessGrid({ topics }: { topics: TopicCard[] }) {
  return (
    <Card title="Readiness by topic" className="hub-wide">
      <ul className="hub-grid">
        {topics.map((t) => (
          <Tile key={t.slug} t={t} />
        ))}
      </ul>
      <p className="hub-note">
        Strength comes from lessons, flashcard recall and interview feedback, and recent evidence counts for more. With fewer than three
        data points it shows as an early read, and with none it says so instead of showing zero.
      </p>
    </Card>
  );
}
