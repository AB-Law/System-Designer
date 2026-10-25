import { ROADMAP, bestScore, firstNotDone, localSubmissions, stageDoneCount, statusFor } from "../../roadmap";
import { useStore } from "../../store";
import { lessonIndex } from "../../lessons/load";
import { pagesSeen, resumePageId } from "../../lessons/progress";
import { GlossText } from "./GlossText";
import { StepCard } from "./StepCard";

export function RoadmapPath({ selectedId, onSelect }: { selectedId: string | null; onSelect: (problemId: string) => void }) {
  const problems = useStore((s) => s.problems);
  const nextUp = firstNotDone();
  const openLearn = useStore((s) => s.openLearn);

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
            {stage.lesson && lessonIndex().some((l) => l.id === stage.lesson) && (
              <ModuleLesson stage={stage} onOpen={(lesson, page) => openLearn(lesson, page)} />
            )}
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

function ModuleLesson({ stage, onOpen }: { stage: (typeof ROADMAP)[number]; onOpen: (lesson: string, page: string) => void }) {
  const lesson = lessonIndex().find((l) => l.id === stage.lesson)!;
  const seen = pagesSeen(lesson);
  return (
    <div className="rm-lesson">
      <div>
        <h3>
          Lesson: {lesson.title} <span className="rm-optional">Optional</span>
        </h3>
        <p className="muted">
          {lesson.pages.length} short pages, about {lesson.minutes} minutes, with something to try on each one.{" "}
          {seen === 0
            ? "You can read it first, or open any problem below straight away."
            : `${seen} of ${lesson.pages.length} pages opened.`}
        </p>
      </div>
      <button type="button" className="btn" onClick={() => onOpen(lesson.id, resumePageId(lesson))}>
        {seen === 0 ? "Read the lesson" : "Continue the lesson"}
      </button>
      {stage.wrapUp && (
        <details className="rm-wrapup">
          <summary>What this module covers</summary>
          <ul className="bul">
            {stage.wrapUp.recap.map((line) => (
              <li key={line}>
                <GlossText text={line} />
              </li>
            ))}
          </ul>
          {stage.wrapUp.reflection && (
            <p className="muted">
              Optional, and not scored: <GlossText text={stage.wrapUp.reflection} />
            </p>
          )}
        </details>
      )}
    </div>
  );
}
