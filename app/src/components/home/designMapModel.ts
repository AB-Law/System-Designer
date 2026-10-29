import type { DesignDoc } from "../../cloud/doc";
import type { EdgeKind } from "../../types";

export interface MapNode {
  id: string;
  blockId: string;
  x: number;
  y: number;
}
export interface MapEdge {
  id: string;
  source: string;
  target: string;
  kind: EdgeKind;
}
export interface MapData {
  nodes: MapNode[];
  edges: MapEdge[];
}

export function mapFromDoc(doc: DesignDoc): MapData {
  return {
    nodes: doc.nodes.map((n) => ({ id: n.id, blockId: n.data.blockId, x: n.position.x, y: n.position.y })),
    edges: doc.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, kind: e.kind })),
  };
}

export interface Frame {
  w: number;
  h: number;
  pad: number;
  nw: number;
  nh: number;
}
export const FRAMES = {
  hero: { w: 640, h: 210, pad: 28, nw: 128, nh: 48 },
  thumb: { w: 240, h: 150, pad: 16, nw: 34, nh: 20 },
} as const satisfies Record<string, Frame>;

/** Fits the design's real positions into the frame, keeping their layout and leaving room for the block size. */
export function place(nodes: MapNode[], f: Frame): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  if (nodes.length === 0) return out;
  const xs = nodes.map((n) => n.x);
  const ys = nodes.map((n) => n.y);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const innerW = f.w - 2 * f.pad - f.nw;
  const innerH = f.h - 2 * f.pad - f.nh;
  // keep the proportions of the layout, so a long thin design stays long and thin
  const sx = maxX > minX ? innerW / (maxX - minX) : 0;
  const sy = maxY > minY ? innerH / (maxY - minY) : 0;
  const k = Math.min(sx || Infinity, sy || Infinity);
  const scale = Number.isFinite(k) ? k : 0;
  const usedW = (maxX - minX) * scale;
  const usedH = (maxY - minY) * scale;
  const ox = f.pad + (innerW - usedW) / 2 + f.nw / 2;
  const oy = f.pad + (innerH - usedH) / 2 + f.nh / 2;
  for (const n of nodes) out.set(n.id, { x: ox + (n.x - minX) * scale, y: oy + (n.y - minY) * scale });
  return out;
}
