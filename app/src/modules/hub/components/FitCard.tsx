import { Card } from "../../../ui/Card";
import type { ActiveTarget, Fit } from "../types";

/** The CV score for the target's job description. Shown only when the CV module is on and the target is linked to a score. */
export function FitCard({ fit, target }: { fit: Fit | null; target: ActiveTarget | null }) {
  return (
    <Card title="Fit to this role">
      {fit ? (
        <div className="hub-stack">
          <p className="hub-muted">Where your CV falls short of this job description, biggest first.</p>
          {fit.gaps.length > 0 && (
            <>
              <div className="hub-label">Top gaps</div>
              <ul className="hub-gaps">
                {fit.gaps.map((g) => (
                  <li key={g.id}>
                    {g.text}
                    <span className="hub-muted">{g.status === "missing" ? "Missing" : "Weak"}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <a href={`#/cv/score/${fit.runId}`} className="hub-link">
            Open the score
          </a>
        </div>
      ) : (
        <div className="hub-stack">
          <p className="hub-muted">
            {target
              ? "No CV score matches this target yet. Scoring your CV against its job description links it here."
              : "Set a target to see how your CV fits it."}
          </p>
          {target && (
            <a href={target.hasJd ? `#/cv/score/target/${target.id}` : "#/cv/score"} className="btn small primary">
              Score your CV for this target
            </a>
          )}
        </div>
      )}
    </Card>
  );
}
