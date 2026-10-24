import { useEffect, useMemo, useRef, useState } from "react";
import { useRun } from "../../hooks";
import { useProblem, useStore } from "../../store";
import { nextStep, tourFor, type TourState } from "../../tour/tour";
import { markTourSeen, tourSeen, useTour } from "../../tour/store";

const CARD_W = 330;
const GAP = 14;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Starts a tour from a clean canvas; whatever was there is saved as a version first. */
export async function beginTour(problemId: string): Promise<void> {
  const s = useStore.getState();
  if (s.problemId !== problemId) await s.setProblem(problemId);
  const now = useStore.getState();
  if (now.nodes.length) {
    await now.saveVersion("Before the tour");
    now.clearAll();
  }
  now.setView("canvas");
  now.setRightTab("problem");
  useTour.getState().start(problemId);
}

/** The offer on a first visit, and the running tour: a spotlight on what to do next and a card that says why. */
export function TourLayer() {
  const view = useStore((s) => s.view);
  const problem = useProblem();
  const run = useRun();
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const rightTab = useStore((s) => s.rightTab);
  const active = useTour((s) => s.active);
  const go = useTour((s) => s.go);
  const end = useTour((s) => s.end);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const advancing = useRef(false);

  const tour = active ? tourFor(active.problemId) : undefined;
  const state: TourState = useMemo(() => {
    const picked = nodes.filter((n) => n.selected);
    return { nodes, edges, rightTab, selectedBlock: picked.length === 1 ? picked[0].data.blockId : undefined, problem, run };
  }, [nodes, edges, rightTab, problem, run]);
  const step = tour && active ? tour.steps[active.step] : undefined;

  // move on when the learner has done the thing, or when the step does not apply
  useEffect(() => {
    if (!tour || !active || !step || advancing.current) return;
    const move = (delay: number) => {
      advancing.current = true;
      window.setTimeout(() => {
        advancing.current = false;
        const n = nextStep(tour, active.step, state);
        if (n >= tour.steps.length) end("done");
        else go(n);
      }, delay);
    };
    if (step.skip?.(state)) move(0);
    else if (step.done?.(state)) move(450);
  }, [tour, active, step, state, go, end]);

  // a block just added is selected, which swaps the block list for its settings: put the list back when a step points into it
  const selectNone = useStore((s) => s.select);
  const anySelected = nodes.some((n) => n.selected);
  useEffect(() => {
    if (anySelected && step && typeof step.target === "string" && step.target.includes("palette-")) selectNone();
  }, [anySelected, step, selectNone]);

  // follow the target as the page moves
  const selector = step && (typeof step.target === "function" ? step.target(state) : step.target);
  useEffect(() => {
    if (!selector) {
      setBox(null);
      return;
    }
    let scrolled = false;
    const measure = () => {
      const el = document.querySelector(selector);
      if (!el) return setBox(null);
      if (!scrolled) {
        el.scrollIntoView({ block: "nearest", inline: "nearest" });
        scrolled = true;
      }
      const r = el.getBoundingClientRect();
      setBox((b) =>
        b && b.x === r.x && b.y === r.y && b.w === r.width && b.h === r.height ? b : { x: r.x, y: r.y, w: r.width, h: r.height },
      );
    };
    measure();
    const t = window.setInterval(measure, 250);
    window.addEventListener("resize", measure);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("resize", measure);
    };
  }, [selector]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && end("skipped");
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, end]);

  if (view !== "canvas") return null;

  // the offer, before anything has started
  if (!active) {
    const offered = problem ? tourFor(problem.id) : undefined;
    if (!problem || !offered || tourSeen(problem.id) || dismissed === problem.id || nodes.length > 0) return null;
    return (
      <div className="tour-offer" role="dialog" aria-label="Guided tour">
        <b>{offered.title}</b>
        <p>{offered.pitch}</p>
        <div>
          <button className="btn small" onClick={() => void beginTour(problem.id)}>
            Start the tour
          </button>{" "}
          <button
            className="btn small ghost"
            onClick={() => {
              markTourSeen(problem.id, "skipped");
              setDismissed(problem.id);
            }}
          >
            No thanks
          </button>
        </div>
      </div>
    );
  }

  if (!tour || !step || active.problemId !== problem?.id) return null;
  const index = tour.steps.indexOf(step);
  const last = index === tour.steps.length - 1;
  const interactive = !!step.done;

  // place the card beside the target when there is room, otherwise below it or centred
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const narrow = vw < 700;
  let style: React.CSSProperties;
  if (narrow || !box) style = narrow ? { left: 12, right: 12, bottom: 12 } : { left: (vw - CARD_W) / 2, top: vh / 3 };
  else if (step.place !== "below" && box.x + box.w + GAP + CARD_W < vw && box.w < vw * 0.5)
    style = { left: box.x + box.w + GAP, top: Math.max(12, Math.min(box.y, vh - 280)) };
  else if (box.y + box.h + GAP + 220 < vh) style = { left: Math.max(12, Math.min(box.x, vw - CARD_W - 12)), top: box.y + box.h + GAP };
  else style = { left: Math.max(12, Math.min(box.x + box.w / 2 - CARD_W / 2, vw - CARD_W - 12)), bottom: 16 };

  return (
    <>
      {box && <div className="tour-spot" style={{ left: box.x - 6, top: box.y - 6, width: box.w + 12, height: box.h + 12 }} aria-hidden />}
      <div
        className="tour-card"
        style={style}
        role="dialog"
        aria-live="polite"
        aria-label={`Tour step ${index + 1} of ${tour.steps.length}`}
      >
        <small>
          Step {index + 1} of {tour.steps.length}
        </small>
        <b>{step.title}</b>
        <p>{step.body}</p>
        <div className="tour-actions">
          {interactive ? (
            <span className="muted">This moves on when you do it.</span>
          ) : (
            <button
              className="btn small"
              onClick={() => {
                const n = nextStep(tour, index, state);
                if (n >= tour.steps.length || last) end("done");
                else go(n);
              }}
            >
              {last ? "Finish" : "Next"}
            </button>
          )}
          <button className="link" onClick={() => end("skipped")}>
            {last ? "Close" : "Skip tour"}
          </button>
        </div>
      </div>
    </>
  );
}
