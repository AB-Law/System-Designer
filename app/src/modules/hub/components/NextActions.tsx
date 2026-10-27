import { Badge } from "../../../ui/Badge";
import { Card } from "../../../ui/Card";
import { EmptyState } from "../../../ui/EmptyState";
import { moduleName } from "../format";
import type { NextAction } from "../types";

export function NextActions({ actions }: { actions: NextAction[] }) {
  return (
    <Card title="Do this next" className="hub-wide">
      {actions.length === 0 ? (
        <EmptyState title="Nothing urgent">Keep going with any module. This list fills in as you practise.</EmptyState>
      ) : (
        <ol className="hub-actions">
          {actions.map((a, i) => (
            <li key={a.key}>
              <a href={a.href} className="hub-action">
                <span className="hub-action-n" aria-hidden="true">
                  {i + 1}
                </span>
                <span className="hub-action-text">
                  <strong>{a.title}</strong>
                  <span className="hub-muted">{a.why}</span>
                </span>
                <Badge tone="gold">{moduleName(a.module)}</Badge>
              </a>
            </li>
          ))}
        </ol>
      )}
      <p className="hub-note">Ranked by simple rules over your activity. No AI call.</p>
    </Card>
  );
}
