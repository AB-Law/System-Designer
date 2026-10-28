import { Badge } from "../../../ui/Badge";
import { Card } from "../../../ui/Card";
import { activityText, ago, moduleName, weekday } from "../format";
import type { Activity, Streak } from "../types";

export function RecentActivity({ items }: { items: Activity[] }) {
  return (
    <Card title="Recent activity" className="hub-wide">
      {items.length === 0 ? (
        <p className="hub-muted">Nothing yet. Review a card or finish a mock interview and it shows up here.</p>
      ) : (
        <ul className="hub-activity">
          {items.map((a) => (
            <li key={`${a.module}:${a.ref}`}>
              <Badge>{moduleName(a.module)}</Badge>
              <span>{activityText(a)}</span>
              <span className="hub-muted">{ago(a.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** The streak as a small chip beside the target: the count and the last seven days as dots. */
export function StreakChip({ streak }: { streak: Streak }) {
  return (
    <div className="hub-streak" title="Consecutive days with some practice">
      <strong>{streak.days}</strong>
      <span className="hub-muted">day streak</span>
      <ul className="hub-week-dots" aria-label="Last seven days">
        {streak.week.map((d) => (
          <li
            key={d.date}
            className={"hub-day" + (d.active ? " on" : "")}
            role="img"
            aria-label={`${weekday(d.date)}: ${d.active ? "active" : "no activity"}`}
          />
        ))}
      </ul>
    </div>
  );
}
