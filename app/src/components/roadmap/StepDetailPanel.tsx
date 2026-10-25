import { useState } from "react";
import { earlierIncomplete, findStep, loadRoadmapPrefs, saveRoadmapPrefs, type RoadmapStep } from "../../roadmap";
import { useStore } from "../../store";
import { GlossText } from "./GlossText";
import { LessonLink } from "./LessonLink";

export function StepDetailPanel({ problemId, onClose }: { problemId: string; onClose: () => void }) {
  const problems = useStore((s) => s.problems);
  const startRoadmapStep = useStore((s) => s.startRoadmapStep);
  const openPrimer = useStore((s) => s.openPrimer);
  const found = findStep(problemId);
  const problem = problems.find((p) => p.id === problemId);
  const earlier = earlierIncomplete(problemId);
  const prefs = loadRoadmapPrefs();
  const [showHint, setShowHint] = useState(!!earlier && !prefs.skipOrderHint);
  const [starting, setStarting] = useState(false);

  if (!found) return null;
  const step: RoadmapStep = found.step;
  const title = problem?.title ?? problemId;

  const start = async () => {
    setStarting(true);
    await startRoadmapStep(problemId);
  };

  const dismissHintForever = () => {
    saveRoadmapPrefs({ ...loadRoadmapPrefs(), skipOrderHint: true });
    setShowHint(false);
  };

  return (
    <aside className="rm-detail" aria-label={`Details for ${title}`}>
      <div className="rm-detail-h">
        <div>
          <span className="muted">
            Step {found.index} · Stage {found.stage.title}
          </span>
          <h3>{title}</h3>
        </div>
        <button type="button" className="btn ghost small" onClick={onClose} aria-label="Close details">
          ×
        </button>
      </div>

      <h4 className="h">You will learn</h4>
      <ul className="bul">
        {step.youWillLearn.map((line) => (
          <li key={line}>
            <GlossText text={line} />
          </li>
        ))}
      </ul>

      <h4 className="h">Primer</h4>
      <ul className="bul primer-list">
        {step.primer.map((line) => (
          <li key={line}>
            <GlossText text={line} />
          </li>
        ))}
      </ul>
      <button type="button" className="btn ghost small" onClick={() => openPrimer(problemId)}>
        Open primer panel
      </button>
      <p className="rm-lesson-link">
        <LessonLink lesson={found.stage.lesson} page={step.lessonPage} />
      </p>

      <p className="watch">
        <strong>Watch out for:</strong> <GlossText text={step.watchOutFor} />
      </p>

      {showHint && earlier && (
        <div className="rm-order-hint" role="note">
          <p>
            Most people do <b>{problems.find((p) => p.id === earlier.problemId)?.title ?? earlier.titleHint}</b> first. It introduces ideas
            this step builds on.
          </p>
          <div className="rm-order-actions">
            <button type="button" className="btn primary" disabled={starting} onClick={() => void start()}>
              Start anyway
            </button>
            <button type="button" className="btn ghost" onClick={dismissHintForever}>
              Do not remind me
            </button>
          </div>
        </div>
      )}

      <div className="rm-detail-actions">
        <button type="button" className="btn primary block" disabled={starting} onClick={() => void start()}>
          Start this problem
        </button>
        <button type="button" className="btn ghost block" onClick={onClose}>
          Jump to a different step
        </button>
      </div>
    </aside>
  );
}
