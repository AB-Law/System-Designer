import type { Problem } from "../../types";
import type { RoadmapStep, StepStatus } from "../../roadmap";

const STATUS_LABEL: Record<StepStatus, string> = {
  done: "Done",
  in_progress: "In progress",
  next: "Next up",
  not_started: "Not started",
};

export function StepCard({
  index,
  step,
  problem,
  status,
  bestScore,
  selected,
  onSelect,
}: {
  index: number;
  step: RoadmapStep;
  problem: Problem | undefined;
  status: StepStatus;
  bestScore: number | null;
  selected: boolean;
  onSelect: () => void;
}) {
  const title = problem?.title ?? step.problemId;
  const diff = problem?.difficulty ?? "medium";

  return (
    <button
      type="button"
      className={`rm-step-card status-${status}${selected ? " selected" : ""}`}
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`Step ${index}: ${title}, ${STATUS_LABEL[status]}`}
    >
      <div className="rm-step-top">
        <span className="rm-step-num" aria-hidden>
          {index}
        </span>
        <div className="rm-step-meta">
          <span className={`diff ${diff}`}>{diff}</span>
          <span className="rm-mins">{step.minutes} min</span>
        </div>
      </div>
      <div className="rm-step-title">{title}</div>
      <div className="rm-step-status">
        {status === "next" && <span className="rm-badge">Recommended next</span>}
        <span className={`rm-status-pill ${status}`}>{STATUS_LABEL[status]}</span>
        {bestScore !== null && <span className="rm-score">Best {bestScore}</span>}
      </div>
      <div className="rm-chips" aria-label="New ideas">
        {step.newIdeas.map((idea) => (
          <span key={idea} className="rm-chip">
            {idea}
          </span>
        ))}
      </div>
    </button>
  );
}
