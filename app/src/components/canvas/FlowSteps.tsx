import { useRun } from "../../hooks";
import { useStore } from "../../store";

const STEPS = ["Build", "Simulate", "Fix issues", "Preview", "Submit"] as const;
type Step = (typeof STEPS)[number];

/** The route through a design, with the step the player should take next. Each step does that step's action. */
export function FlowSteps() {
  const nodes = useStore((s) => s.nodes.length);
  const tab = useStore((s) => s.rightTab);
  const setTab = useStore((s) => s.setRightTab);
  const setRunOpen = useStore((s) => s.setRunOpen);
  const submit = useStore((s) => s.submit);
  const run = useRun();

  const failing = run ? run.scenarios.filter((s) => !s.pass).length : 0;
  const problems = run ? run.findings.filter((f) => f.severity === "bad").length : 0;
  const issues = failing + problems;

  let current: Step;
  let hint: string;
  if (nodes === 0) {
    current = "Build";
    hint = "Add blocks from the list on the left, then connect them.";
  } else if (tab !== "simulate" && !run?.scenarios.some((s) => s.offered > 0)) {
    current = "Simulate";
    hint = "Connect your blocks, then watch how the traffic scenarios play out.";
  } else if (issues > 0) {
    current = "Fix issues";
    hint = `${issues} ${issues === 1 ? "thing needs" : "things need"} fixing: ${failing ? `${failing} failing scenario${failing === 1 ? "" : "s"}` : ""}${failing && problems ? " and " : ""}${problems ? `${problems} problem${problems === 1 ? "" : "s"} found` : ""}.`;
  } else {
    current = "Preview";
    hint = "Nothing is failing. Preview your score, then submit to save the attempt.";
  }

  const act = (step: Step) => {
    if (step === "Build") setTab("problem");
    else if (step === "Simulate" || step === "Fix issues") setTab("simulate");
    else if (step === "Preview") setRunOpen(true);
    else void submit();
  };

  return (
    <div className="flow" aria-label="Steps to finish a design">
      <ol className="flow-steps">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button
              type="button"
              className={"flow-step" + (s === current ? " now" : STEPS.indexOf(current) > i ? " done" : "")}
              aria-current={s === current ? "step" : undefined}
              onClick={() => act(s)}
              disabled={s !== "Build" && nodes === 0}
            >
              <span className="flow-n">{i + 1}</span> {s}
            </button>
          </li>
        ))}
      </ol>
      <p className="flow-hint">
        <b>Next:</b> {hint}
      </p>
    </div>
  );
}
