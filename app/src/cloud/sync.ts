import { call, cloudOn, lsGet, lsSet } from "../api";
import type { Problem, Submission } from "../types";
import { docKey, sanitizeDoc, type DesignDoc } from "./doc";
import { addVersion, type Version } from "./versions";

interface Saved extends Partial<DesignDoc> {
  at?: number;
}

const designKey = (problemId: string) => `dc:design:${problemId}`;

/** The saved canvas for a problem, as this browser last stored it. */
export function localDesign(problemId: string): { doc: DesignDoc | null; at: number } {
  const saved = lsGet<Saved | null>(designKey(problemId), null);
  const doc = saved ? sanitizeDoc(saved) : null;
  return { doc: doc && doc.nodes.length ? doc : null, at: saved?.at ?? 0 };
}

let timer: ReturnType<typeof setTimeout> | undefined;
let pending: { problemId: string; doc: DesignDoc; at: number } | undefined;

/** Send the canvas to the account shortly after the last edit, so dragging a block does not make a request per pixel. */
export function pushDesignSoon(problemId: string, doc: DesignDoc, at: number): void {
  if (!cloudOn()) return;
  pending = { problemId, doc, at };
  clearTimeout(timer);
  timer = setTimeout(() => void flushDesign(), 1500);
}

export async function flushDesign(): Promise<void> {
  clearTimeout(timer);
  const p = pending;
  pending = undefined;
  if (!p || !cloudOn()) return;
  try {
    await call(`/designs/${p.problemId}`, "PUT", { doc: p.doc, updated: p.at });
  } catch {
    /* stays in this browser; the next edit tries again */
  }
}

/** If the account holds a newer canvas than this browser, bring it here (keeping a copy of what was here). */
export async function pullDesign(problemId: string): Promise<void> {
  if (!cloudOn()) return;
  await flushDesign();
  try {
    const remote = await call<{ doc: unknown; updated: number }>(`/designs/${problemId}`);
    const doc = sanitizeDoc(remote.doc);
    if (!doc) return;
    const local = localDesign(problemId);
    if (remote.updated <= local.at) return;
    if (local.doc && docKey(local.doc) !== docKey(doc)) {
      await addVersion(problemId, { label: "Before sync from your account", kind: "auto", doc: local.doc }).catch(() => undefined);
    }
    lsSet(designKey(problemId), { ...doc, at: remote.updated });
  } catch {
    /* no design saved in the account yet, or offline: keep the local one */
  }
}

/** First sign-in: upload what this browser already holds (nothing is overwritten on the server). */
export async function syncUp(problems: Problem[]): Promise<void> {
  for (const p of problems) {
    for (const sub of lsGet<Submission[]>(`dc:subs:${p.id}`, [])) {
      await call(`/submissions/${p.id}`, "POST", sub).catch(() => undefined);
    }
    const mine = localDesign(p.id);
    if (mine.doc)
      await call(`/designs/${p.id}`, "PUT", { doc: mine.doc, updated: mine.at || Date.now(), ifEmpty: true }).catch(() => undefined);
    const versions = lsGet<Version[]>(`dc:versions:${p.id}`, []);
    for (const v of [...versions].reverse()) {
      await call(`/versions/${p.id}`, "POST", {
        label: v.label,
        kind: v.kind,
        score: v.score,
        passed: v.passed,
        total: v.total,
        doc: v.doc,
      }).catch(() => undefined);
    }
    if (versions.length) lsSet(`dc:versions:${p.id}`, []);
  }
}

/** Put the account's submissions into this browser, so progress and the roadmap match on every device. */
export async function syncSubmissionsDown(): Promise<void> {
  try {
    const all = await call<Record<string, Submission[]>>("/submissions");
    for (const [problemId, remote] of Object.entries(all)) {
      const byAt = new Map<number, Submission>();
      for (const s of [...lsGet<Submission[]>(`dc:subs:${problemId}`, []), ...remote]) byAt.set(s.at, s);
      lsSet(
        `dc:subs:${problemId}`,
        [...byAt.values()].sort((a, b) => b.at - a.at),
      );
    }
  } catch {
    /* offline: keep what is here */
  }
}
