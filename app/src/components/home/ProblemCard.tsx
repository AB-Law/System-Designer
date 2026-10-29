import type { StepStatus } from "../../roadmap/types";
import type { Problem } from "../../types";
import { editedText, passedLine, scenarioLine, trafficLine, twoSentences, type CardData } from "./cardData";
import { DesignMap } from "./DesignMap";
import { mapFromDoc } from "./designMapModel";

const STATUS: Record<StepStatus, string> = { done: "Done", in_progress: "In progress", next: "Up next", not_started: "Not started" };
const LEVEL = { easy: "Easy", medium: "Medium", hard: "Hard" } as const;

const tier = (score: number): string => (score >= 80 ? "good" : score >= 50 ? "mid" : "low");

/**
 * One problem. A started problem shows the person's own design; a new one shows a calm blank canvas with its scenario count and
 * peak load. The best score, scenarios passed and last edit sit underneath. Used as a row on the path and a tile in the grid.
 */
export function ProblemCard({ p, d, layout, onOpen }: { p: Problem; d: CardData; layout: "row" | "tile"; onOpen: () => void }) {
  const passed = passedLine(d);
  return (
    <button
      type="button"
      className={`pcard ${layout} status-${d.status}`}
      onClick={onOpen}
      aria-label={`${p.title}, ${LEVEL[p.difficulty]}, ${STATUS[d.status]}`}
    >
      <span className="pcard-thumb">
        {d.doc ? (
          <DesignMap data={mapFromDoc(d.doc)} variant="thumb" label={`Your design for ${p.title}, ${d.blocks} blocks`} />
        ) : (
          <span className="pcard-blank">
            <b>{scenarioLine(p)}</b>
            <span>{trafficLine(p)}</span>
          </span>
        )}
      </span>
      <span className="pcard-body">
        <span className="pcard-meta">
          <i className={`diff-dot ${p.difficulty}`} aria-hidden="true" />
          {LEVEL[p.difficulty]}
          <span className="pcard-status">{STATUS[d.status]}</span>
        </span>
        <b className="pcard-title">{p.title}</b>
        <span className="pcard-brief">{twoSentences(p.brief)}</span>
        {p.constraints[0] && <span className="pcard-rule">{p.constraints[0]}</span>}
        {(d.best !== null || d.doc) && (
          <span className="pcard-prog">
            {d.best !== null && (
              <span className="pcard-score">
                <i className={`pcard-bar ${tier(d.best)}`} aria-hidden="true">
                  <i style={{ width: `${Math.min(100, Math.max(0, d.best))}%` }} />
                </i>
                <span>
                  Best {d.best}
                  {passed && ` · ${passed}`}
                </span>
              </span>
            )}
            {d.doc && d.edited !== null && (
              <span className="pcard-edit">
                {d.blocks} block{d.blocks === 1 ? "" : "s"} · {editedText(d.edited)}
              </span>
            )}
          </span>
        )}
      </span>
    </button>
  );
}
