import { useMemo } from "react";
import { useRun } from "../../hooks";
import { diagnoseNode } from "../../sim/diagnose";
import { toDesign, useProblem, useStore } from "../../store";

/** At the top of a block's settings: why it is red or amber in the scenario being looked at, and what to try. */
export function WhyPanel({ nodeId }: { nodeId: string }) {
  const run = useRun();
  const problem = useProblem();
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const simScenario = useStore((s) => s.simScenario);
  const setSim = useStore((s) => s.setSimScenario);

  const found = useMemo(() => {
    if (!run) return undefined;
    const design = toDesign(nodes, edges);
    const node = design.nodes.find((n) => n.id === nodeId);
    if (!node) return undefined;
    const all = [...run.scenarios, ...run.interview];
    const ordered = [...all.filter((s) => s.scenarioId === simScenario), ...all.filter((s) => s.scenarioId !== simScenario)];
    for (const sc of ordered) {
      const d = diagnoseNode(node, sc.nodes[nodeId], sc, run.findings, design, problem);
      if (d) return { d, sc };
    }
    return undefined;
  }, [run, nodes, edges, nodeId, simScenario, problem]);

  if (!found) return null;
  const { d, sc } = found;
  return (
    <div className={"why " + d.tone} role="status">
      <div className="why-h">{d.tone === "bad" ? "Why this is red" : "Why this is amber"}</div>
      <p className="why-t">{d.headline}</p>
      {sc.scenarioId !== simScenario && (
        <p className="why-s">
          This is in "{sc.title}".{" "}
          <button className="link" onClick={() => setSim(sc.scenarioId)}>
            Show that scenario
          </button>
        </p>
      )}
      {d.causes.length > 0 && (
        <ul>
          {d.causes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      )}
      {d.tries.length > 0 && (
        <>
          <div className="why-k">Things to try</div>
          <ul>
            {d.tries.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
