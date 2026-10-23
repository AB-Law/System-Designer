import { ROADMAP, bestScore, firstNotDone, localSubmissions, stageDoneCount, statusFor } from "../../roadmap";
import { useStore } from "../../store";
import { StepCard } from "./StepCard";

export function RoadmapPath({ selectedId, onSelect }: { selectedId: string | null; onSelect: (problemId: string) => void }) {
  const problems = useStore((s) => s.problems);
  const nextUp = firstNotDone();

  return (
    <div className="rm-path">
      {ROADMAP.map((stage, stageIdx) => {
        const { done, total } = stageDoneCount(stage.id);
        const pct = total ? Math.round((done / total) * 100) : 0;
        const indexBase = ROADMAP.slice(0, stageIdx).reduce((n, s) => n + s.steps.length, 0);
        return (
          <section key={stage.id} className="rm-stage" aria-labelledby={`stage-${stage.id}`}>
            <header className="rm-stage-h">
              <div>
                <h2 id={`stage-${stage.id}`}>{stage.title}</h2>
                <p className="muted">{stage.blurb}</p>
              </div>
              <div className="rm-stage-prog" aria-label={`Stage progress ${done} of ${total}`}>
                <div className="rm-bar">
                  <div className="rm-bar-fill" style={{ width: `${pct}%` }} />
                </div>
                <span className="rm-stage-count">
                  {done}/{total}
                </span>
              </div>
            </header>
            <div className="rm-steps">
              {stage.steps.map((step, stepIdx) => {
                const index = indexBase + stepIdx + 1;
                const problem = problems.find((p) => p.id === step.problemId);
                const subs = localSubmissions(step.problemId);
                const status = statusFor(step.problemId, nextUp, subs);
                return (
                  <div key={step.problemId} className="rm-step-wrap">
                    <div className="rm-path-line" aria-hidden />
                    <StepCard
                      index={index}
                      step={step}
                      problem={problem}
                      status={status}
                      bestScore={bestScore(subs)}
                      selected={selectedId === step.problemId}
                      onSelect={() => onSelect(step.problemId)}
                    />
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
