import { BLOCK_MAP } from "../blocks";
import { lsGet, lsSet } from "../api";
import { toDoc, type DesignDoc } from "../cloud/doc";
import { pushDesignSoon } from "../cloud/sync";
import type { EdgeKind } from "../types";
import { edgeProps } from "./canvas";
import type { RFEdge, RFNode, Snapshot } from "./types";

export const persist = (problemId: string, nodes: RFNode[], edges: RFEdge[]) => {
  const at = Date.now();
  const doc = toDoc(nodes, edges);
  lsSet(`dc:design:${problemId}`, { ...doc, at });
  pushDesignSoon(problemId, doc, at);
};

export const fromDoc = (doc: DesignDoc): Snapshot => ({
  nodes: doc.nodes.map((n) => ({ id: n.id, type: "block", position: n.position, data: n.data }) as RFNode),
  edges: doc.edges.map(
    (e) =>
      ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
        ...edgeProps(e.kind),
      }) as RFEdge,
  ),
});

/** Data in this browser belongs to whoever signed in last; a different person starts clean, so nothing leaks into their account. */
export function wipeLocalData(): void {
  try {
    const prefixes = ["dc:design:", "dc:subs:", "dc:versions:", "dc:chat:", "dc:interview:", "dc:est:", "dc:tour:"];
    for (const k of Object.keys(localStorage)) {
      if (prefixes.some((p) => k.startsWith(p)) || k === "dc:roadmap" || k === "dc:lessons" || k === "dc:last") localStorage.removeItem(k);
    }
  } catch {
    /* storage unavailable */
  }
}

export function restore(problemId: string): Snapshot {
  const saved = lsGet<{ nodes: RFNode[]; edges: (RFEdge & { kind: EdgeKind })[] } | null>(`dc:design:${problemId}`, null);
  if (!saved) return { nodes: [], edges: [] };
  return {
    nodes: saved.nodes.filter((n) => BLOCK_MAP[n.data?.blockId]).map((n) => ({ ...n, type: "block" })),
    edges: saved.edges.map(
      (e) =>
        ({
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle,
          targetHandle: e.targetHandle,
          ...edgeProps(e.kind ?? "sync"),
        }) as RFEdge,
    ),
  };
}
