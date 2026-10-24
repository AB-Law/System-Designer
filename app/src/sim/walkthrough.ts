// Reference walkthrough: the problem's worked alternative, one step at a time, with each step checked against the learner's own design.
import { BLOCKS } from "../blocks";
import type { Design, Problem } from "../types";

export interface WalkBlock {
  blockId: string;
  label: string;
  /** the learner's design has a block of this kind */
  have: boolean;
}

export interface WalkStep {
  text: string;
  blocks: WalkBlock[];
}

export interface Walkthrough {
  summary: string;
  steps: WalkStep[];
  tradeoffs: string[];
  /** how many steps name blocks, and how many of those the learner's design has them all for */
  covered: number;
  total: number;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Block kinds a sentence names: "Server", "Workers", "Third-party API". */
export function blocksNamed(text: string): { blockId: string; label: string }[] {
  const out: { blockId: string; label: string }[] = [];
  for (const b of BLOCKS) {
    if (b.id === "user") continue;
    if (new RegExp(`\\b${esc(b.label)}(s|es)?\\b`, "i").test(text)) out.push({ blockId: b.id, label: b.label });
  }
  return out;
}

export function walkthrough(problem: Problem, design: Design): Walkthrough | undefined {
  const ref = problem.reference;
  if (!ref) return undefined;
  const kinds = new Set(design.nodes.map((n) => n.blockId));
  const steps = ref.design.map((text) => ({ text, blocks: blocksNamed(text).map((b) => ({ ...b, have: kinds.has(b.blockId) })) }));
  const named = steps.filter((s) => s.blocks.length > 0);
  return {
    summary: ref.summary,
    steps,
    tradeoffs: ref.tradeoffs,
    covered: named.filter((s) => s.blocks.every((b) => b.have)).length,
    total: named.length,
  };
}
