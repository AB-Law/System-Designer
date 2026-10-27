import { Card } from "../../../ui/Card";
import type { ActiveTarget, Fit } from "../types";

/** The CV score for the target's job description. Shown only when the CV module is on and the target is linked to a score. */
export function FitCard({ fit, target }: { fit: Fit | null; target: ActiveTarget | null }) {
  return (
    <Card title="Fit to this role">
      {fit ? (
        <div className="hub-stack">
          <div className="hub-big">
            {fit.total ?? "–"}
            <span className="hub-muted"> / 100 · your CV against the job description</span>
          </div>
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
          <a href="#/cv" className="hub-link">
            Open the score
          </a>
        </div>
      ) : (
        <p className="hub-muted">
          {target
            ? "No CV score is linked to this target yet. Score your CV against its job description in the CV module."
            : "Set a target to see how your CV fits it."}
        </p>
      )}
    </Card>
  );
}
