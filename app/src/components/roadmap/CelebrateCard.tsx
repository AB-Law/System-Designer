import { findStep, firstNotDone } from "../../roadmap";
import { useStore } from "../../store";
import { GlossText } from "./GlossText";

export function CelebrateCard() {
  const celebrate = useStore((s) => s.celebrate);
  const clearCelebrate = useStore((s) => s.clearCelebrate);
  const startRoadmapStep = useStore((s) => s.startRoadmapStep);
  const setView = useStore((s) => s.setView);
  const problems = useStore((s) => s.problems);

  if (!celebrate) return null;
  const found = findStep(celebrate.problemId);
  const title = problems.find((p) => p.id === celebrate.problemId)?.title ?? celebrate.problemId;
  const nextId = firstNotDone();

  const goNext = () => {
    clearCelebrate();
    if (nextId && nextId !== celebrate.problemId) {
      void startRoadmapStep(nextId);
    } else {
      setView("roadmap");
    }
  };

  return (
    <div className="celebrate-card" role="status">
      <div className="celebrate-h">
        <strong>Step complete</strong>
        <button type="button" className="btn ghost small" onClick={clearCelebrate} aria-label="Dismiss">
          ×
        </button>
      </div>
      <p>
        You passed <b>{title}</b>. Before you move on, sit with these for a moment:
      </p>
      {found && (
        <ul className="bul">
          {found.step.reflect.map((q) => (
            <li key={q}>
              <GlossText text={q} />
            </li>
          ))}
        </ul>
      )}
      <div className="celebrate-actions">
        {nextId && nextId !== celebrate.problemId ? (
          <button type="button" className="btn primary" onClick={goNext}>
            Next step
          </button>
        ) : (
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              clearCelebrate();
              setView("roadmap");
            }}
          >
            Back to roadmap
          </button>
        )}
        <button type="button" className="btn ghost" onClick={clearCelebrate}>
          Stay here
        </button>
      </div>
    </div>
  );
}
