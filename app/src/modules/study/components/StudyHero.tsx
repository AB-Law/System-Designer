import { forecastDays, nextDueLabel } from "../plan";
import { go } from "../route";
import type { StudyStats } from "../types";
import { StatTiles } from "../../../ui/StatTiles";

const SECONDS_PER_CARD = 20;

/** The Study landing: how many cards are due today, the one button that starts them, and how the habit is holding. */
export function StudyHero({ stats }: { stats: StudyStats }) {
  const due = stats.dueToday;
  const minutes = Math.max(1, Math.round((due * SECONDS_PER_CARD) / 60));
  const retention = stats.retention == null ? null : Math.round(stats.retention * 100);
  const days = forecastDays(stats);
  const peak = Math.max(1, ...days.map((d) => d.count));
  const next = nextDueLabel(stats.nextDue);
  return (
    <>
      <StatTiles
        label="Today"
        tiles={[
          {
            label: "Due today",
            value: String(due),
            unit: due === 1 ? "card" : "cards",
            caption:
              due > 0
                ? `About ${minutes} minute${minutes === 1 ? "" : "s"}. Little and often beats a long session.`
                : next
                  ? `You are all caught up. The next card comes back ${next}.`
                  : "You are all caught up.",
            hero: true,
            action: (
              <button type="button" className="btn primary" disabled={due === 0} onClick={() => go({ name: "review", deckId: null })}>
                {due > 0 ? "Start review" : "Nothing due"}
              </button>
            ),
          },
          {
            label: "Streak",
            value: String(stats.streak),
            unit: stats.streak === 1 ? "day" : "days",
            caption: stats.streak > 0 ? "Keep it going today" : "Review a card to start one",
          },
          {
            label: "Retention",
            value: retention === null ? "–" : `${retention}%`,
            caption: retention === null ? "Shows after your first reviews" : "Of cards you answered correctly",
          },
        ]}
      />
      {days.length > 0 && (
        <section className="st-outlook" aria-label="Cards due over the next seven days">
          <h2>The week ahead</h2>
          <ol>
            {days.map((d, i) => (
              <li key={i} className={i === 0 ? "today" : ""}>
                <b>{d.count}</b>
                <i aria-hidden="true">
                  <i style={{ height: `${Math.max(4, (d.count / peak) * 100)}%` }} />
                </i>
                <span>{d.label}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}
