import { useStore } from "../../store";

const MODE_TITLE = { fix: "Fixes for your weak spots", tune: "Review of your setup" } as const;

/** AI advisor: builds what is missing for a weak rating, or reviews the setup. Every suggestion is approved or rejected on its own. */
export function AdvisorCard({ weak }: { weak: boolean }) {
  const ai = useStore((s) => s.ai);
  const setAiOpen = useStore((s) => s.setAiOpen);
  const advisor = useStore((s) => s.advisor);
  const busy = useStore((s) => s.advisorBusy);
  const error = useStore((s) => s.advisorError);
  const run = useStore((s) => s.runAdvisor);
  const apply = useStore((s) => s.applyProposal);
  const reject = useStore((s) => s.rejectProposal);
  const clear = useStore((s) => s.clearAdvisor);

  if (ai.provider === "off")
    return (
      <p className="muted advisor-off">
        Want AI to fix weak spots and explain why?{" "}
        <button className="link" onClick={() => setAiOpen(true)}>
          Set up LM Studio or OpenAI
        </button>
      </p>
    );

  return (
    <div className="advisor" data-testid="advisor">
      <h4 className="h">
        AI advisor <small>suggests, you approve</small>
      </h4>
      <div className="advisor-actions">
        {weak && (
          <button
            className="btn small primary"
            disabled={busy}
            onClick={() => void run("fix")}
            title="Build what is missing for the ratings below 100"
          >
            Fix weak spots
          </button>
        )}
        <button
          className="btn small"
          disabled={busy}
          onClick={() => void run("tune")}
          title="Look over your blocks and settings and suggest changes"
        >
          Review my setup
        </button>
      </div>
      {busy && <p className="muted">Thinking… a local model can take a minute or two.</p>}
      {error && <p className="err">{error}</p>}
      {advisor && !busy && (
        <div className="advisor-result">
          <div className="advisor-head">
            <b>{MODE_TITLE[advisor.mode]}</b>
            <button className="link" onClick={clear}>
              Clear
            </button>
          </div>
          {advisor.summary && <p>{advisor.summary}</p>}
          {advisor.proposals.length === 0 && <p className="muted">No changes to suggest.</p>}
          {advisor.proposals.map((p) => (
            <div className={"proposal " + p.status} key={p.id}>
              <b className="proposal-title">{p.title}</b>
              <p className="proposal-why">{p.why}</p>
              <small>What changes</small>
              <ul>
                {p.summary.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
              {p.effect && (
                <p className={"proposal-effect" + (p.worse ? " worse" : "")}>
                  Simulated: {p.effect}.{p.worse && " This lowers your score, so check the reasoning before you approve it."}
                </p>
              )}
              {p.status === "pending" ? (
                <div className="proposal-actions">
                  <button className="btn small primary" onClick={() => apply(p.id)}>
                    Approve
                  </button>
                  <button className="btn small ghost" onClick={() => reject(p.id)}>
                    Reject
                  </button>
                </div>
              ) : (
                <small className="proposal-state">
                  {p.status === "applied"
                    ? "Applied. Ctrl+Z undoes it."
                    : p.status === "rejected"
                      ? "Rejected."
                      : "Your canvas changed, so this no longer fits. Ask again."}
                </small>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
