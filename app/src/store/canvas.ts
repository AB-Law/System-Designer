import type { Design, EdgeKind } from "../types";
import type { RFEdge, RFNode } from "./types";

const EDGE_STYLE: Record<EdgeKind, { color: string; dash?: string }> = {
  sync: { color: "#d4b45a" },
  async: { color: "#6fa0e8", dash: "6 4" },
  both: { color: "#4fb58a" },
};

export function edgeProps(kind: EdgeKind): Partial<RFEdge> {
  const st = EDGE_STYLE[kind];
  const marker = { type: "arrowclosed" as const, color: st.color, width: 18, height: 18 };
  return {
    type: "default",
    animated: kind === "async",
    style: { stroke: st.color, strokeWidth: 2, strokeDasharray: st.dash },
    markerEnd: marker,
    markerStart: kind === "both" ? marker : undefined,
    data: { kind },
  };
}

export const toDesign = (nodes: RFNode[], edges: RFEdge[]): Design => ({
  nodes: nodes.map((n) => ({
    id: n.id,
    blockId: n.data.blockId,
    cfg: n.data.cfg,
    responsibilities: n.data.responsibilities,
    capabilities: n.data.capabilities,
  })),
  edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, kind: e.data?.kind ?? "sync" })),
});

/** Move a new block down until it no longer sits on top of another one. */
export function freeSpot(nodes: RFNode[], p: { x: number; y: number }): { x: number; y: number } {
  let y = p.y;
  for (let i = 0; i < 60; i++) {
    if (!nodes.some((n) => Math.abs(n.position.x - p.x) < 150 && Math.abs(n.position.y - y) < 64)) break;
    y += 72;
  }
  return { x: p.x, y };
}

/** Left-to-right layers following the connections, so a design reads like a diagram the first time. */
export function layered(nodes: RFNode[], edges: RFEdge[]): Map<string, { x: number; y: number }> {
  const ids = nodes.map((n) => n.id);
  const layer = new Map(ids.map((i) => [i, 0]));
  const linked = new Set<string>();
  for (const e of edges) {
    if (layer.has(e.source) && layer.has(e.target)) {
      linked.add(e.source);
      linked.add(e.target);
    }
  }
  // push each block right of everything feeding it; the pass limit keeps cycles from running away
  for (let pass = 0; pass < ids.length; pass++) {
    let changed = false;
    for (const e of edges) {
      if (!layer.has(e.source) || !layer.has(e.target) || e.source === e.target) continue;
      const want = layer.get(e.source)! + 1;
      if (want > layer.get(e.target)! && want < ids.length) {
        layer.set(e.target, want);
        changed = true;
      }
    }
    if (!changed) break;
  }
  const columns = new Map<number, string[]>();
  for (const id of ids) {
    if (!linked.has(id)) continue;
    const l = layer.get(id)!;
    columns.set(l, [...(columns.get(l) ?? []), id]);
  }
  const yOf = new Map<string, number>();
  const pos = new Map<string, { x: number; y: number }>();
  [...columns.keys()]
    .sort((a, b) => a - b)
    .forEach((l) => {
      const col = columns.get(l)!;
      // order by the average height of what feeds each block, to keep lines from crossing
      const mean = (id: string) => {
        const ys = edges.filter((e) => e.target === id && yOf.has(e.source)).map((e) => yOf.get(e.source)!);
        return ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : 0;
      };
      col.sort((a, b) => mean(a) - mean(b));
      col.forEach((id, i) => {
        const y = 200 + (i - (col.length - 1) / 2) * 96;
        yOf.set(id, y);
        pos.set(id, { x: l * 230, y });
      });
    });
  // blocks with no connections wait in a row underneath
  const loose = ids.filter((i) => !linked.has(i));
  const bottom = Math.max(300, ...[...yOf.values()].map((y) => y + 140));
  loose.forEach((id, i) => pos.set(id, { x: i * 190, y: bottom }));
  return pos;
}

let idCounter = Date.now() % 100000;
export const nextId = (blockId: string) => `${blockId}-${(idCounter++).toString(36)}`;

export const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));
