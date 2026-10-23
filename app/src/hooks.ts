import { useMemo } from "react";
import { analyze } from "./sim/analyze";
import { toDesign, useProblem, useStore } from "./store";
import type { RunResult } from "./types";

/** The design as the reviewer saw it, so a verdict can be tied to the exact design it judged. */
function useDesignKey(): string {
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  return useMemo(() => JSON.stringify(toDesign(nodes, edges)), [nodes, edges]);
}

/**
 * Re-runs the full simulation whenever the design or problem changes. It is cheap, so it is always live.
 * The interviewer's follow-up tests run too (not scored), and AI verdicts count while the design is unchanged.
 */
export function useRun(): RunResult | undefined {
  const problem = useProblem();
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const review = useStore((s) => s.review);
  const reviewKey = useStore((s) => s.reviewKey);
  const interview = useStore((s) => s.interview);
  const key = useDesignKey();
  return useMemo(() => {
    if (!problem) return undefined;
    const fresh = review?.verdicts && reviewKey === key ? review.verdicts : undefined;
    return analyze(toDesign(nodes, edges), problem, { followUps: interview, verdicts: fresh });
  }, [problem, nodes, edges, review, reviewKey, interview, key]);
}

/** True when an AI review exists but the design has changed since, so its verdicts no longer count. */
export function useReviewStale(): boolean {
  const review = useStore((s) => s.review);
  const reviewKey = useStore((s) => s.reviewKey);
  const key = useDesignKey();
  return !!review?.verdicts?.length && reviewKey !== key;
}
