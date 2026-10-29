import { moduleName } from "../format";
import type { Summary } from "../types";
import "../hero.css";

const FOLLOW_UPS = 3;

/** The single best next move, large, with the few moves after it so there is one list and no second "to do" panel. */
export function NextMove({ summary }: { summary: Summary }) {
  const [next, ...rest] = summary.actions;
  if (!next) return null;
  return (
    <section className="hub-today" aria-label="What to do next">
      <a className="hub-next" href={next.href}>
        <span className="hub-stat-label">Best next move</span>
        <strong>{next.title}</strong>
        <span className="hub-next-why">{next.why}</span>
        <span className="hub-go" aria-hidden="true">
          Go
          <i>→</i>
        </span>
      </a>
      {rest.length > 0 && (
        <div className="hub-after">
          <h2 className="hub-after-h">After that</h2>
          <ol>
            {rest.slice(0, FOLLOW_UPS).map((a) => (
              <li key={a.key}>
                <a href={a.href} className="hub-after-row">
                  <span>
                    <strong>{a.title}</strong>
                    <small>{a.why}</small>
                  </span>
                  <em>{moduleName(a.module)}</em>
                </a>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
