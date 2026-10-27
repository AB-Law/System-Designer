import type { Band, Component, ReqStatus, Run } from "./types";

export const bandTone = (b: Band | null): "good" | "warn" | "bad" => (b === "strong" ? "good" : b === "fair" ? "warn" : "bad");
export const bandLabel = (b: Band | null): string =>
  b === "strong" ? "Strong match" : b === "fair" ? "Fair match" : b === "weak" ? "Weak match" : "Not scored";
export const qualityTone = (q: number): "good" | "warn" | "bad" => (q >= 75 ? "good" : q >= 45 ? "warn" : "bad");
export const statusTone = (s: ReqStatus): "good" | "warn" | "bad" => (s === "met" ? "good" : s === "partial" ? "warn" : "bad");
export const STRENGTH = ["None", "Mentioned", "Used", "Led or measured"];

export function when(ms: number, now = Date.now()): string {
  const d = Math.max(0, now - ms);
  const m = Math.round(d / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const days = Math.round(h / 24);
  return days < 30 ? `${days} d ago` : new Date(ms).toLocaleDateString();
}

export const cite = (e: { line: number | null; page: number | null }): string =>
  e.line ? (e.page ? `page ${e.page}, line ${e.line}` : `line ${e.line}`) : "";

export interface ComponentDelta {
  key: string;
  label: string;
  before: number | null;
  after: number | null;
  change: number | null;
}

/** Component-by-component change between two runs. A component rated on only one side has no change. */
export function compareComponents(a: Component[], b: Component[]): ComponentDelta[] {
  return b.map((c) => {
    const before = a.find((x) => x.key === c.key)?.score ?? null;
    const after = c.score;
    return {
      key: c.key,
      label: c.label,
      before,
      after,
      change: before !== null && after !== null ? Math.round((after - before) * 10) / 10 : null,
    };
  });
}

export interface RequirementChange {
  text: string;
  before: ReqStatus | "absent";
  after: ReqStatus | "absent";
}

const RANK: Record<ReqStatus | "absent", number> = { absent: 0, missing: 0, partial: 1, met: 2 };

/** Requirements whose status differs between two runs, biggest improvements first. */
export function compareRequirements(a: Run, b: Run): RequirementChange[] {
  const texts = [...new Set([...a.evidence.map((e) => e.text), ...b.evidence.map((e) => e.text)])];
  const status = (r: Run, t: string): ReqStatus | "absent" => r.evidence.find((e) => e.text === t)?.status ?? "absent";
  return texts
    .map((text) => ({ text, before: status(a, text), after: status(b, text) }))
    .filter((c) => c.before !== c.after)
    .sort((x, y) => RANK[y.after] - RANK[y.before] - (RANK[x.after] - RANK[x.before]));
}

/** True when two runs were made under the same rubric, so their totals can be compared fairly. */
export const comparable = (a: Run, b: Run): boolean => a.rubricVersion === b.rubricVersion;

export function splitLines(s: string): string[] {
  return s
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
}
export const splitSkills = (s: string): string[] =>
  s
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
