import { BLOCK_MAP, clampCfg, defaultCfg } from "../blocks";
import type { RFEdge, RFNode } from "../store";
import type { Design, EdgeKind, NodeData } from "../types";

/** A design as it is saved, versioned and shared: blocks with positions, and connections. */
export interface DocNode {
  id: string;
  type?: string;
  position: { x: number; y: number };
  data: NodeData;
}
export interface DocEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  kind: EdgeKind;
}
export interface DesignDoc {
  nodes: DocNode[];
  edges: DocEdge[];
}

export function toDoc(nodes: RFNode[], edges: RFEdge[]): DesignDoc {
  return {
    nodes: nodes.map((n) => ({ id: n.id, type: "block", position: { x: n.position.x, y: n.position.y }, data: n.data })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
      kind: e.data?.kind ?? "sync",
    })),
  };
}

export function docToDesign(doc: DesignDoc): Design {
  return {
    nodes: doc.nodes.map((n) => ({
      id: n.id,
      blockId: n.data.blockId,
      cfg: n.data.cfg,
      responsibilities: n.data.responsibilities,
      capabilities: n.data.capabilities,
    })),
    edges: doc.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, kind: e.kind })),
  };
}

/** Same design, ignoring where blocks sit on the canvas. */
export const docKey = (doc: DesignDoc): string => JSON.stringify(docToDesign(doc));

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const str = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : "");
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? Math.max(-100000, Math.min(100000, v)) : 0);
const KINDS: EdgeKind[] = ["sync", "async", "both"];
const HANDLES = ["top", "right", "bottom", "left"];

/**
 * Turn anything that claims to be a design (a file, a link, another person's share) into a safe one:
 * unknown blocks are dropped, settings are clamped to what the app allows, text is length limited.
 */
export function sanitizeDoc(raw: unknown): DesignDoc | null {
  const r = obj(raw);
  if (!Array.isArray(r.nodes) || !Array.isArray(r.edges)) return null;
  const ids = new Set<string>();
  const nodes: DocNode[] = [];
  for (const item of r.nodes.slice(0, 200)) {
    const o = obj(item);
    const id = str(o.id, 64);
    const data = obj(o.data);
    const def = BLOCK_MAP[str(data.blockId, 40)];
    if (!def || !/^[\w.-]+$/.test(id) || ids.has(id)) continue;
    ids.add(id);
    const pos = obj(o.position);
    const caps = Array.isArray(data.capabilities)
      ? data.capabilities
          .slice(0, 30)
          .map((c) => str(c, 64))
          .filter(Boolean)
      : undefined;
    nodes.push({
      id,
      type: "block",
      position: { x: num(pos.x), y: num(pos.y) },
      data: {
        blockId: def.id,
        cfg: clampCfg(def, { ...defaultCfg(def), ...obj(data.cfg) }),
        responsibilities: Array.isArray(data.responsibilities)
          ? data.responsibilities
              .slice(0, 20)
              .map((x) => str(x, 500))
              .filter(Boolean)
          : [],
        capabilities: caps,
      },
    });
  }
  const edges: DocEdge[] = [];
  const seen = new Set<string>();
  for (const item of r.edges.slice(0, 600)) {
    const o = obj(item);
    const source = str(o.source, 64);
    const target = str(o.target, 64);
    if (!ids.has(source) || !ids.has(target) || source === target || seen.has(`${source}>${target}`)) continue;
    seen.add(`${source}>${target}`);
    const kind = KINDS.includes(o.kind as EdgeKind) ? (o.kind as EdgeKind) : "sync";
    const handle = (v: unknown) => (HANDLES.includes(v as string) ? (v as string) : undefined);
    edges.push({
      id: `e-${source}-${target}`,
      source,
      target,
      sourceHandle: handle(o.sourceHandle),
      targetHandle: handle(o.targetHandle),
      kind,
    });
  }
  return { nodes, edges };
}

// ---------------------------------------------------------------- what changed between two designs
const nameMap = (doc: DesignDoc): Map<string, string> => {
  const total = new Map<string, number>();
  doc.nodes.forEach((n) => total.set(n.data.blockId, (total.get(n.data.blockId) ?? 0) + 1));
  const seen = new Map<string, number>();
  const out = new Map<string, string>();
  for (const n of doc.nodes) {
    const label = BLOCK_MAP[n.data.blockId]?.label ?? n.data.blockId;
    const i = (seen.get(n.data.blockId) ?? 0) + 1;
    seen.set(n.data.blockId, i);
    out.set(n.id, (total.get(n.data.blockId) ?? 0) > 1 ? `${label} ${i}` : label);
  }
  return out;
};

const show = (v: unknown): string => (Array.isArray(v) ? v.join(", ") || "none" : typeof v === "boolean" ? (v ? "on" : "off") : String(v));

export interface DocDiff {
  added: string[];
  removed: string[];
  changed: string[];
  linksAdded: string[];
  linksRemoved: string[];
}

export function diffDocs(a: DesignDoc, b: DesignDoc): DocDiff {
  const na = nameMap(a);
  const nb = nameMap(b);
  const ma = new Map(a.nodes.map((n) => [n.id, n]));
  const mb = new Map(b.nodes.map((n) => [n.id, n]));
  const out: DocDiff = { added: [], removed: [], changed: [], linksAdded: [], linksRemoved: [] };
  for (const n of b.nodes) if (!ma.has(n.id)) out.added.push(nb.get(n.id)!);
  for (const n of a.nodes) if (!mb.has(n.id)) out.removed.push(na.get(n.id)!);
  for (const n of b.nodes) {
    const was = ma.get(n.id);
    if (!was) continue;
    const label = nb.get(n.id)!;
    const keys = new Set([...Object.keys(was.data.cfg), ...Object.keys(n.data.cfg)]);
    for (const k of keys) {
      const x = was.data.cfg[k];
      const y = n.data.cfg[k];
      if (JSON.stringify(x) !== JSON.stringify(y)) out.changed.push(`${label}: ${k} ${show(x)} → ${show(y)}`);
    }
    if (JSON.stringify(was.data.capabilities ?? null) !== JSON.stringify(n.data.capabilities ?? null))
      out.changed.push(`${label}: what it runs changed`);
    if (was.data.responsibilities.join("|") !== n.data.responsibilities.join("|")) out.changed.push(`${label}: notes changed`);
  }
  const ea = new Map(a.edges.map((e) => [`${e.source}>${e.target}`, e]));
  const eb = new Map(b.edges.map((e) => [`${e.source}>${e.target}`, e]));
  const link = (e: DocEdge, names: Map<string, string>) =>
    `${names.get(e.source) ?? e.source} → ${names.get(e.target) ?? e.target}${e.kind === "sync" ? "" : ` (${e.kind})`}`;
  for (const [k, e] of eb) if (!ea.has(k)) out.linksAdded.push(link(e, nb));
  for (const [k, e] of ea) if (!eb.has(k)) out.linksRemoved.push(link(e, na));
  for (const [k, e] of eb) {
    const was = ea.get(k);
    if (was && was.kind !== e.kind) out.changed.push(`Link ${link(e, nb)}: was ${was.kind}`);
  }
  return out;
}

export const diffIsEmpty = (d: DocDiff): boolean =>
  !d.added.length && !d.removed.length && !d.changed.length && !d.linksAdded.length && !d.linksRemoved.length;

// ---------------------------------------------------------------- self-contained links (no server needed)
const MAX_DECODED = 400_000;

const toB64Url = (bytes: Uint8Array): string => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromB64Url = (text: string): Uint8Array => {
  const s = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

async function pump(bytes: Uint8Array, stream: CompressionStream | DecompressionStream, limit: number): Promise<Uint8Array> {
  const w = stream.writable.getWriter();
  void w.write(bytes as BufferSource).catch(() => undefined);
  void w.close().catch(() => undefined);
  const reader = stream.readable.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      void reader.cancel();
      throw new Error("too large");
    }
    parts.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

export interface SharedPayload {
  problemId: string;
  label: string;
  doc: DesignDoc;
}

/** The part after the # of a link that carries the whole design inside it. */
export async function encodeShareHash(p: SharedPayload): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify({ v: 1, p: p.problemId, l: p.label, d: p.doc }));
  if (typeof CompressionStream === "undefined") return "d=r." + toB64Url(bytes);
  return "d=z." + toB64Url(await pump(bytes, new CompressionStream("deflate"), MAX_DECODED));
}

export async function decodeShareHash(hash: string): Promise<SharedPayload | null> {
  const m = /^#?d=([zr])\.([\w-]+)$/.exec(hash);
  if (!m || m[2].length > 300_000) return null;
  try {
    const raw = fromB64Url(m[2]);
    const bytes = m[1] === "z" ? await pump(raw, new DecompressionStream("deflate"), MAX_DECODED) : raw;
    const j = obj(JSON.parse(new TextDecoder().decode(bytes)));
    const doc = sanitizeDoc(j.d);
    const problemId = str(j.p, 64);
    if (!doc || !/^[a-z0-9_]+$/.test(problemId)) return null;
    return { problemId, label: str(j.l, 80) || "Shared design", doc };
  } catch {
    return null;
  }
}
