import { Card } from "../../../ui/Card";
import { useStore } from "../../../store";
import { goModule } from "../../../shell/route";
import { useModules } from "../../../shell/useActiveModule";
import { resumeItems } from "../format";
import type { Activity } from "../types";

/** Where you left off: the design on the canvas, the last mock interview, the last study session. Draws nothing on a first visit. */
export function ResumeCard({ activity }: { activity: Activity[] }) {
  const modules = useModules();
  const design = modules.find((m) => m.id === "design");
  const problem = useStore((s) => s.problems.find((p) => p.id === s.problemId));
  const blocks = useStore((s) => s.nodes.length);
  const setView = useStore((s) => s.setView);
  const items = resumeItems(activity);
  const hasDesign = Boolean(design && problem && blocks > 0);
  if (!hasDesign && items.length === 0) return null;

  return (
    <Card title="Pick up where you left off">
      <ul className="hub-resume">
        {hasDesign && design && problem && (
          <li>
            <button
              type="button"
              className="hub-resume-item"
              onClick={() => {
                setView("canvas");
                goModule(design, modules);
              }}
            >
              <strong>Your {problem.title} design</strong>
              <span className="hub-muted">
                {blocks} block{blocks === 1 ? "" : "s"} on the canvas
              </span>
            </button>
          </li>
        )}
        {items.map((r) => (
          <li key={r.key}>
            <a className="hub-resume-item" href={r.href}>
              <strong>{r.title}</strong>
              <span className="hub-muted">{r.detail}</span>
            </a>
          </li>
        ))}
      </ul>
    </Card>
  );
}
