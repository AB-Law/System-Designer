import { Card } from "../../../ui/Card";
import { BLURBS } from "../../../shell/blurbs";
import { goModule } from "../../../shell/route";
import { useModules } from "../../../shell/useActiveModule";

/** A way into every enabled module, so the Hub is where you start from. */
export function ModuleCards() {
  const all = useModules();
  const modules = all.filter((m) => m.id !== "hub");
  return (
    <Card title="Jump in">
      <ul className="hub-modules">
        {modules.map((m) => (
          <li key={m.id}>
            <button type="button" className="hub-module-card" onClick={() => goModule(m, all)}>
              <strong>{BLURBS[m.id]?.title ?? m.title}</strong>
              <span className="hub-muted">{BLURBS[m.id]?.blurb}</span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
