import { Badge } from "../../../ui/Badge";
import { Card } from "../../../ui/Card";
import { activityText, ago, moduleName } from "../format";
import type { Activity } from "../types";

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
