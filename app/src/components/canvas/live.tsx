// The live layer of the canvas: a context carrying the simulated state, the animated connection, and the control bar.
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react";
import { BLOCK_MAP } from "../../blocks";
import { useRun } from "../../hooks";
import { toDesign, useProblem, useStore } from "../../store";
import {
  captionFor,
  droppedPerSec,
  edgeFlows,
  nodeVisuals,
  runLive,
  servedOf,
  stepQueues,
  type Caption,
  type EdgeFlow,
  type LiveControls,
  type NodeVisual,
} from "../../sim/live";

interface LiveValue {
  on: boolean;
  /** animation allowed: not reduced-motion, tab visible */
  animate: boolean;
  nodes: Record<string, NodeVisual>;
  flows: Record<string, EdgeFlow>;
}

const OFF: LiveValue = { on: false, animate: false, nodes: {}, flows: {} };
export const LiveContext = createContext<LiveValue>(OFF);
export const useLive = () => useContext(LiveContext);

const TICK_MS = 500;
const TRAVEL_S = 2.4;

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)").matches : false,
  );
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    const f = () => setReduced(mq.matches);
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, []);
  return reduced;
}

function useTabVisible(): boolean {
  const [vis, setVis] = useState(() => typeof document === "undefined" || document.visibilityState !== "hidden");
  useEffect(() => {
    const f = () => setVis(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", f);
    return () => document.removeEventListener("visibilitychange", f);
  }, []);
  return vis;
}

/** A connection that draws its particles with SVG motion along the path: no JS loop, and paused with the tab. */
export function FlowEdge(p: EdgeProps) {
  const live = useLive();
  const [path] = getBezierPath(p);
  const flow = live.on ? live.flows[p.id] : undefined;
  const svgRef = useRef<SVGGElement>(null);
  useEffect(() => {
    const svg = svgRef.current?.ownerSVGElement;
    if (!svg) return;
    if (live.animate) svg.unpauseAnimations();
    else svg.pauseAnimations();
  }, [live.animate, flow?.particles]);
  const style = flow?.dead ? { ...p.style, stroke: "var(--bad)", strokeDasharray: "4 6", opacity: 0.8 } : p.style;
  const n = flow?.particles ?? 0;
  const lossy = (i: number) => flow !== undefined && i < Math.round(flow.lossShare * n);
  return (
    <>
      <BaseEdge id={p.id} path={path} markerEnd={p.markerEnd} style={style} interactionWidth={p.interactionWidth} />
      {flow && !flow.dead && live.animate && (
        <g ref={svgRef} className="flow-particles" pointerEvents="none">
          {Array.from({ length: n }, (_, i) => (
            <circle key={i} r={3.2} className={lossy(i) ? "flow-dot lost" : "flow-dot"}>
              <animateMotion dur={`${TRAVEL_S}s`} begin={`${-(i * TRAVEL_S) / n}s`} repeatCount="indefinite" path={path} />
            </circle>
          ))}
        </g>
      )}
      {flow?.dead && (
        <text className="flow-dead" x={(p.sourceX + p.targetX) / 2} y={(p.sourceY + p.targetY) / 2 - 6} textAnchor="middle">
          ✕
        </text>
      )}
    </>
  );
}

/** Owns the live simulation state; renders its provider around the canvas and the control bar over it. */
export function LiveLayer({ children }: { children: React.ReactNode }) {
  const problem = useProblem();
  const run = useRun();
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const simScenario = useStore((s) => s.simScenario);
  const [on, setOn] = useState(false);
  const [ctl, setCtl] = useState<LiveControls>({ spike: false });
  const [queues, setQueues] = useState<Record<string, number>>({});
  const [lost, setLost] = useState(0);
  const reduced = usePrefersReducedMotion();
  const visible = useTabVisible();

  const design = useMemo(() => toDesign(nodes, edges), [nodes, edges]);
  const killable = useMemo(() => design.nodes.filter((n) => n.blockId !== "user"), [design]);
  const base = problem?.scenarios.find((s) => s.id === simScenario) ?? problem?.scenarios[0];
  const killedKey = (ctl.killed ?? []).filter((id) => killable.some((n) => n.id === id)).join(",");
  const killed = useMemo(() => (killedKey ? killedKey.split(",") : []), [killedKey]);
  const controls = useMemo<LiveControls>(() => ({ spike: ctl.spike, killed }), [ctl.spike, killed]);
  const toggleKill = (id: string) => setCtl({ ...ctl, killed: killed.includes(id) ? killed.filter((k) => k !== id) : [...killed, id] });

  const sim = useMemo(() => {
    if (!on || !problem || design.nodes.length === 0) return undefined;
    const steady = runLive(design, problem, base, { spike: false });
    const now = controls.spike || killed.length ? runLive(design, problem, base, controls) : steady;
    return { steady, now };
  }, [on, problem, design, base, controls, killed.length]);

  // queue depth and lost requests accumulate over time; the clock only runs while the tab is visible
  const backlogRef = useRef<Record<string, number>>({});
  const lostRate = useRef(0);
  useEffect(() => {
    backlogRef.current = sim?.now.queueBacklog ?? {};
    lostRate.current = sim ? droppedPerSec(sim.now, servedOf(design, sim.now, sim.steady, killed)) : 0;
  }, [sim, design, killed]);
  useEffect(() => {
    if (!on || !visible) return;
    const t = setInterval(() => {
      setQueues((q) => stepQueues(q, backlogRef.current, TICK_MS / 1000));
      setLost((l) => l + lostRate.current * (TICK_MS / 1000));
    }, TICK_MS);
    return () => clearInterval(t);
  }, [on, visible]);

  const reset = () => {
    setCtl({ spike: false });
    setQueues({});
    setLost(0);
  };
  useEffect(reset, [problem?.id, simScenario]);

  const value = useMemo<LiveValue>(
    () =>
      sim
        ? {
            on: true,
            animate: !reduced && visible,
            nodes: nodeVisuals(design, sim.now, queues, killed),
            flows: edgeFlows(design, sim.now),
          }
        : OFF,
    [sim, design, queues, reduced, visible, killed],
  );
  const caption: Caption | undefined = useMemo(
    () => (sim && problem ? captionFor(design, problem, sim.now, sim.steady, controls, run?.findings) : undefined),
    [sim, problem, design, controls, run?.findings],
  );

  return (
    <LiveContext.Provider value={value}>
      {children}
      <div className="live-bar" data-live={on ? "on" : "off"}>
        <div className="live-ctl">
          <button
            className={on ? "active" : ""}
            title="Watch requests flow through your design and see what breaks"
            aria-pressed={on}
            onClick={() => {
              setOn(!on);
              reset();
            }}
          >
            {on ? "■ Stop live" : "▶ Live simulation"}
          </button>
          {on && (
            <>
              <button
                className={ctl.spike ? "active" : ""}
                aria-pressed={ctl.spike}
                title="Multiply the traffic and watch which block gives out first"
                onClick={() => setCtl({ ...ctl, spike: !ctl.spike })}
              >
                ⚡ Traffic spike
              </button>
              <details className="kill-menu">
                <summary
                  className={killed.length ? "active bad" : ""}
                  title="Pick the blocks to take down together. Each loses one copy; a block with a single copy goes fully down."
                >
                  {killed.length ? `✕ ${killed.length} down` : "✕ Kill blocks"}
                </summary>
                <div className="kill-list" role="group" aria-label="Blocks to kill">
                  {killable.map((n) => (
                    <label key={n.id}>
                      <input type="checkbox" checked={killed.includes(n.id)} onChange={() => toggleKill(n.id)} />
                      {BLOCK_MAP[n.blockId]?.label ?? n.blockId}
                      {n.responsibilities[0] ? ` (${n.responsibilities[0]})` : ""}
                    </label>
                  ))}
                  {!killable.length && <small>Add a block to kill.</small>}
                </div>
              </details>
              {killed.length > 0 && <button onClick={() => setCtl({ ...ctl, killed: [] })}>↺ Revive all</button>}
            </>
          )}
        </div>
        {on && caption && (
          <div className={`live-caption ${caption.tone}`} role="status" aria-live="polite">
            <b>{caption.what}</b> <span>{caption.why}</span>
            <small>
              {lost >= 1 && <>Lost so far: {Math.round(lost).toLocaleString()} requests. </>}
              {Object.entries(queues).map(([id, d]) => (
                <span key={id}>
                  Queue {BLOCK_MAP[design.nodes.find((n) => n.id === id)?.blockId ?? ""]?.label ?? ""}: {Math.round(d).toLocaleString()}{" "}
                  waiting.{" "}
                </span>
              ))}
              {reduced && "Animation is off (reduced motion); block states still update."}
            </small>
          </div>
        )}
      </div>
    </LiveContext.Provider>
  );
}
