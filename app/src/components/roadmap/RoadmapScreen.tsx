import { useState } from "react";
import { TOTAL_STEPS, continueTarget, countDone } from "../../roadmap";
import { useStore } from "../../store";
import { GlossaryPanel } from "./GlossaryPanel";
import { RoadmapPath } from "./RoadmapPath";
import { StepDetailPanel } from "./StepDetailPanel";

export function RoadmapScreen() {
  const [tab, setTab] = useState<"path" | "glossary">("path");
  const selectedId = useStore((s) => s.roadmapSelectedStepId);
  const setSelected = useStore((s) => s.setRoadmapSelectedStepId);
  const startRoadmapStep = useStore((s) => s.startRoadmapStep);
  const problems = useStore((s) => s.problems);

  const done = countDone();
  const pct = TOTAL_STEPS ? Math.round((done / TOTAL_STEPS) * 100) : 0;
  const continueId = continueTarget();
  const continueTitle = problems.find((p) => p.id === continueId)?.title ?? continueId;

  return (
    <div className={"rm-screen" + (tab === "path" && selectedId ? " with-detail" : "")}>
      <div className="rm-main">
        <header className="rm-hero">
          <div className="rm-hero-text">
            <h1>Learning roadmap</h1>
            <p className="muted">
              A guided path through every practice problem. Start at the top if you are new to system design. You can open any step —
              nothing is locked.
            </p>
          </div>
          <div className="rm-overall" aria-label={`Overall progress ${done} of ${TOTAL_STEPS}`}>
            <div className="rm-ring" style={{ ["--pct" as string]: pct }}>
              <span className="rm-ring-num">
                {done}
                <i>/{TOTAL_STEPS}</i>
              </span>
              <span className="rm-ring-label">done</span>
            </div>
            <button type="button" className="btn primary rm-continue" onClick={() => void startRoadmapStep(continueId)}>
              Continue · {continueTitle}
            </button>
          </div>
        </header>

        <nav className="tabs rm-tabs" aria-label="Roadmap sections">
          <button type="button" className={tab === "path" ? "active" : ""} onClick={() => setTab("path")}>
            Path
          </button>
          <button type="button" className={tab === "glossary" ? "active" : ""} onClick={() => setTab("glossary")}>
            Glossary
          </button>
        </nav>

        <div className="rm-body scroll">
          {tab === "path" ? <RoadmapPath selectedId={selectedId} onSelect={(id) => setSelected(id)} /> : <GlossaryPanel />}
        </div>
      </div>

      {tab === "path" && selectedId && <StepDetailPanel key={selectedId} problemId={selectedId} onClose={() => setSelected(null)} />}
    </div>
  );
}
