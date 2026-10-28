import { Card } from "../../../ui/Card";
import { barWidth, dataPoints, moduleName, splitTopics, TIER_COLOR, TIER_WORD } from "../format";
import type { Track, TopicCard } from "../types";

const TRACK_SOURCE = {
  target: "from your target role",
  cv: "from your CV",
  default: "the default, until your target or CV says otherwise",
};

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
        {t.extra && " · outside your track"}
      </div>
    </li>
  );
}

function Row({ t }: { t: TopicCard }) {
  const color = TIER_COLOR[t.tier];
  return (
    <li className="hub-row">
      <span>
        {t.label}
        {t.relevant && <span className="hub-muted"> · in this job description</span>}
      </span>
      <span className="hub-row-bar" aria-hidden="true">
        <span style={{ width: barWidth(t.strength, t.tier), background: color }} />
      </span>
      <span style={{ color }}>{TIER_WORD[t.tier]}</span>
    </li>
  );
}

function Calibrate({ modules }: { modules: string[] }) {
  return (
    <div className="hub-calibrate">
      <p>
        Nothing is recorded yet, so there is nothing to rank. About ten minutes is enough to start: answer a few flashcards or run one mock
        interview round, and your strengths and gaps appear here.
      </p>
      <div className="hub-calibrate-go">
        {modules.includes("study") && (
          <a className="btn small primary" href="#/study">
            Review some cards
          </a>
        )}
        {modules.includes("interview") && (
          <a className="btn small" href="#/interview/new">
            Run a mock interview
          </a>
        )}
      </div>
    </div>
  );
}

export function ReadinessGrid({ topics, track, modules }: { topics: TopicCard[]; track: Track; modules: string[] }) {
  const { focus, rest, empty } = splitTopics(topics);
  return (
    <Card title="Readiness by topic" className="hub-wide">
      <p className="hub-muted">
        Showing {track.label} topics, {TRACK_SOURCE[track.source]}.
      </p>
      {focus.length === 0 ? (
        <Calibrate modules={modules} />
      ) : (
        <>
          <div className="hub-label">Work on these first</div>
          <ul className="hub-grid">
            {focus.map((t) => (
              <Tile key={t.slug} t={t} />
            ))}
          </ul>
          {rest.length > 0 && (
            <ul className="hub-rows" aria-label="Other topics with data">
              {rest.map((t) => (
                <Row key={t.slug} t={t} />
              ))}
            </ul>
          )}
          {empty.length > 0 && <p className="hub-muted">Nothing recorded yet for {empty.map((t) => t.label.toLowerCase()).join(", ")}.</p>}
        </>
      )}
      <p className="hub-note">
        Strength comes from lessons, flashcard recall and interview feedback, and recent evidence counts for more. With fewer than three
        data points it shows as an early read, and with none it says so instead of showing zero.
      </p>
    </Card>
  );
}
