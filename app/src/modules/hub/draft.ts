import type { Target, TargetInput } from "./types";

/** The target form's fields as the user edits them, and the conversions to and from what the API stores. */
export interface Draft {
  title: string;
  level: string;
  company: string;
  date: string;
  jdText: string;
  roleId: number | null;
  scoreRunId: number | null;
}

export const EMPTY: Draft = { title: "", level: "", company: "", date: "", jdText: "", roleId: null, scoreRunId: null };

export const draftOf = (t: Target): Draft => ({
  title: t.title,
  level: t.level,
  company: t.company ?? "",
  date: t.date ?? "",
  jdText: t.jdText ?? "",
  roleId: t.roleId,
  scoreRunId: t.scoreRunId,
});

export const inputOf = (d: Draft): TargetInput => ({
  title: d.title.trim(),
  level: d.level.trim(),
  company: d.company.trim() || null,
  date: d.date || null,
  jdText: d.jdText.trim() || null,
  roleId: d.roleId,
  scoreRunId: d.scoreRunId,
});
