import { useState } from "react";
import { useRun } from "../../hooks";
import { walkthrough } from "../../sim/walkthrough";
import { toDesign, useProblem, useStore } from "../../store";

/** After the scenarios pass (or on request): the reference design step by step, with a check of what the learner's design already has. */
export function WalkthroughCard() {
  const problem = useProblem();
  const run = useRun();
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const [open, setOpen] = useState(false);
  const [asked, setAsked] = useState(false);
  if (!problem || !run) return null;
  const w = walkthrough(problem, toDesign(nodes, edges));
  if (!w) return null;
  const passed = run.scenarios.length > 0 && run.scenarios.every((s) => s.pass);

  return (
    <div className="walk">
      <h4 className="h">Walk through the reference design</h4>
      {!open && !passed && !asked && (
        <>
          <p className="muted">This shows one full answer. Try a bit longer first, or open it when you are stuck.</p>
          <button className="btn small ghost" onClick={() => setAsked(true)}>
            I am stuck, show me
          </button>
        </>
      )}
      {!open && !passed && asked && (
        <>
          <p className="muted">It will spoil the puzzle, and your score stays as it is. Show it?</p>
          <button className="btn small" onClick={() => setOpen(true)}>
            Yes, show the walkthrough
          </button>{" "}
          <button className="btn small ghost" onClick={() => setAsked(false)}>
            Not yet
          </button>
        </>
      )}
      {!open && passed && (
        <>
          <p className="muted">Your design passes. See how a worked answer compares, and what it trades off.</p>
          <button className="btn small" onClick={() => setOpen(true)}>
            Walk me through it
          </button>
        </>
      )}
      {open && (
        <div className="walk-body">
          <p>{w.summary}</p>
          {w.total > 0 && (
            <p className="muted">
              Your design has the blocks for {w.covered} of the {w.total} steps below.
            </p>
          )}
          <ol className="walk-steps">
            {w.steps.map((s, i) => (
              <li key={i}>
                <span>{s.text}</span>
                {s.blocks.length > 0 && (
                  <span className="walk-chips">
                    {s.blocks.map((b) => (
                      <i
                        key={b.blockId}
                        className={b.have ? "have" : "miss"}
                        title={b.have ? "Your design has one" : "Your design has no block of this kind"}
                      >
                        {b.have ? "✓" : "✕"} {b.label}
                      </i>
                    ))}
                  </span>
                )}
              </li>
            ))}
          </ol>
          {w.tradeoffs.length > 0 && (
            <>
              <small>What it costs</small>
              <ul>
                {w.tradeoffs.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </>
          )}
          <p className="muted">A different design that passes is just as good. This is one way, not the only way.</p>
          <button className="btn small ghost" onClick={() => setOpen(false)}>
            Hide it
          </button>
        </div>
      )}
    </div>
  );
}
