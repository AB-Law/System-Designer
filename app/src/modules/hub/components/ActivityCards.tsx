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

export function StreakCard({ streak }: { streak: Streak }) {
  return (
    <Card title="Streak">
      <div className="hub-big">
        {streak.days}
        <span className="hub-muted"> day{streak.days === 1 ? "" : "s"} in a row</span>
      </div>
      <ul className="hub-week" aria-label="Last seven days">
        {streak.week.map((d) => (
          <li key={d.date}>
            <span
              className={"hub-day" + (d.active ? " on" : "")}
              role="img"
              aria-label={`${weekday(d.date)}: ${d.active ? "active" : "no activity"}`}
            />
            <span className="hub-muted">{weekday(d.date)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
