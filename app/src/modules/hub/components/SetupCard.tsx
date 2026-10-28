import { lazy, Suspense, useState } from "react";
import { Badge } from "../../../ui/Badge";
import { Card } from "../../../ui/Card";
import { useAction } from "../../../shared/async";
import { hubApi } from "../api";
import { TargetForm } from "./TargetForm";
import type { SetupStep, TargetInput } from "../types";

// The CV module's own upload box, loaded only when this step is open and the CV module is on.
const CvUpload = lazy(() => import("../../cv/components/CvUpload").then((m) => ({ default: m.CvUpload })));

const DISMISSED = "hub-setup-dismissed";
const read = (): boolean => {
  try {
    return localStorage.getItem(DISMISSED) === "1";
  } catch {
    return false;
  }
};

/** Steps that are finished inside the Hub instead of sending the user to another screen. */
const INLINE = new Set(["target", "cv"]);

function Inline({ step, onDone }: { step: SetupStep; onDone: () => void }) {
  const { busy, run } = useAction();
  if (step.key === "target") {
    const save = async (input: TargetInput) => {
      if (await run(() => hubApi.createTarget(input), "Target saved")) onDone();
    };
    return <TargetForm initial={null} busy={busy} onSave={(i) => void save(i)} onCancel={onDone} />;
  }
  return (
    <Suspense fallback={<p className="hub-muted">Loading…</p>}>
      <CvUpload bare onUploaded={onDone} />
    </Suspense>
  );
}

/** The first-run checklist. Each step is done when its data exists, so it never needs to be ticked by hand. */
export function SetupCard({ steps, onChange }: { steps: SetupStep[]; onChange: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(read);
  const [shown, setShown] = useState<boolean | null>(null); // null: follow the default, open until something is done
  const done = steps.filter((s) => s.done).length;
  if (dismissed || steps.length === 0 || done === steps.length) return null;
  const nextStep = steps.find((s) => !s.done);
  const next = nextStep?.key;
  const expanded = shown ?? done === 0;

  if (!expanded) {
    return (
      <div className="hub-strip">
        <strong>
          Get set up · {done} of {steps.length}
        </strong>
        <span className="hub-strip-bar" aria-hidden="true">
          <span style={{ width: `${Math.round((done / steps.length) * 100)}%` }} />
        </span>
        <span className="hub-muted hub-strip-next">Next: {nextStep?.title}</span>
        <button type="button" className="hub-link" onClick={() => setShown(true)}>
          Show steps
        </button>
      </div>
    );
  }

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED, "1");
    } catch {
      /* private mode: it comes back next visit */
    }
  };

  return (
    <Card
      title={`Get set up · ${done} of ${steps.length}`}
      actions={
        <>
          {done > 0 && (
            <button type="button" className="hub-link" onClick={() => setShown(false)}>
              Collapse
            </button>
          )}
          <button type="button" className="hub-link" onClick={dismiss}>
            Hide
          </button>
        </>
      }
    >
      <ol className="hub-setup">
        {steps.map((s) => (
          <li key={s.key} className={s.done ? "done" : s.key === next ? "next" : ""}>
            <div className="hub-setup-row">
              <span className="hub-setup-mark" aria-hidden="true">
                {s.done ? "✓" : ""}
              </span>
              <div className="hub-setup-text">
                <strong>{s.title}</strong>
                <span className="hub-muted">{s.hint}</span>
              </div>
              {s.done ? (
                <Badge tone="good">Done</Badge>
              ) : INLINE.has(s.key) ? (
                <button type="button" className="btn small" onClick={() => setOpen(open === s.key ? null : s.key)}>
                  {open === s.key ? "Close" : "Do this here"}
                </button>
              ) : (
                <a className="btn small" href={s.href}>
                  Open
                </a>
              )}
            </div>
            {open === s.key && !s.done && (
              <div className="hub-setup-inline">
                <Inline
                  step={s}
                  onDone={() => {
                    setOpen(null);
                    onChange();
                  }}
                />
              </div>
            )}
          </li>
        ))}
      </ol>
    </Card>
  );
}
