import { call, cloudOn, lsGet, lsSet } from "../api";
import { docKey, type DesignDoc } from "./doc";

export type VersionKind = "manual" | "auto" | "coach" | "restore";

export interface Version {
  id: string;
  label: string;
  kind: VersionKind;
  score?: number | null;
  passed?: number | null;
  total?: number | null;
  created: number;
  doc: DesignDoc;
}

const LOCAL_MAX = 40;
const key = (problemId: string) => `dc:versions:${problemId}`;

/** Versions live on the server for signed-in users and in this browser for guests. */
export async function listVersions(problemId: string): Promise<Version[]> {
  if (cloudOn()) return call<Version[]>(`/versions/${problemId}`);
  return lsGet<Version[]>(key(problemId), []);
}

export async function addVersion(problemId: string, v: Omit<Version, "id" | "created">): Promise<Version> {
  if (cloudOn()) return call<Version>(`/versions/${problemId}`, "POST", v);
  const all = lsGet<Version[]>(key(problemId), []);
  const made: Version = { ...v, id: `l-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, created: Date.now() };
  let next = [made, ...all];
  while (next.length > LOCAL_MAX) {
    // drop automatic snapshots first, oldest first
    const i = [...next].reverse().findIndex((x) => x.kind === "auto");
    next.splice(i >= 0 ? next.length - 1 - i : next.length - 1, 1);
  }
  next = next.sort((a, b) => b.created - a.created);
  lsSet(key(problemId), next);
  return made;
}

export async function renameVersion(problemId: string, id: string, label: string): Promise<void> {
  if (cloudOn()) {
    await call(`/versions/${problemId}/${id}`, "PATCH", { label });
    return;
  }
  lsSet(
    key(problemId),
    lsGet<Version[]>(key(problemId), []).map((v) => (v.id === id ? { ...v, label, kind: v.kind === "auto" ? "manual" : v.kind } : v)),
  );
}

export async function removeVersion(problemId: string, id: string): Promise<void> {
  if (cloudOn()) {
    await call(`/versions/${problemId}/${id}`, "DELETE");
    return;
  }
  lsSet(
    key(problemId),
    lsGet<Version[]>(key(problemId), []).filter((v) => v.id !== id),
  );
}

/** Automatic snapshots skip designs that are identical to the newest version, so Run does not fill the list. */
export const sameAsNewest = (list: Version[], doc: DesignDoc): boolean => list.length > 0 && docKey(list[0].doc) === docKey(doc);
