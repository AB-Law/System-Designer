import type { Design } from "../types";

/**
 * Machine-readable reference designs for the problems Roadmap v2 adds. The 17 original problems only describe their reference in
 * words, so they are not checked here. Add an entry when a new problem is added (tasks 12, 13, 17, 20).
 */
export const REFERENCE_DESIGNS: Record<string, Design> = {};

/** Problem ids that must have an entry above. Each new-problem task appends its id. */
export const PROBLEMS_NEEDING_A_REFERENCE: string[] = [];
