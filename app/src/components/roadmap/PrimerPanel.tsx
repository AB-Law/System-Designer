import { findStep, markPrimerRead } from "../../roadmap";
import { useStore } from "../../store";
import { GlossText } from "./GlossText";

export function PrimerPanel() {
  const open = useStore((s) => s.primerOpen);
  const problemId = useStore((s) => s.primerProblemId);
  const closePrimer = useStore((s) => s.closePrimer);
  const problems = useStore((s) => s.problems);

  if (!open || !problemId) return null;
  const found = findStep(problemId);
  const title = problems.find((p) => p.id === problemId)?.title ?? problemId;

  const onClose = () => {
    markPrimerRead(problemId);
    closePrimer();
  };

  return (
    <div className="overlay" role="presentation" onClick={onClose}>
      <div className="modal narrow primer-modal" role="dialog" aria-labelledby="primer-title" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="x" onClick={onClose} aria-label="Close primer">
          ×
        </button>
        <h3 className="m-h" id="primer-title">
          Primer · {title}
        </h3>
        <div className="m-body">
          {!found ? (
            <p className="muted">This problem is not on the learning path.</p>
          ) : (
            <>
              <p className="muted">Read this before you start. It explains ideas, not the answer.</p>
              <ul className="bul primer-list">
                {found.step.primer.map((line) => (
                  <li key={line}>
                    <GlossText text={line} />
                  </li>
                ))}
              </ul>
              <p className="watch">
                <strong>Watch out for:</strong> <GlossText text={found.step.watchOutFor} />
              </p>
            </>
          )}
          <button type="button" className="btn primary block" onClick={onClose} style={{ marginTop: 12 }}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
