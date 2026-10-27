/** The role form's state, and the rules for when it can be submitted. */
export interface RoleDraft {
  /** an existing role, or "new" to describe one here */
  roleId: number | "new";
  title: string;
  level: string;
  company: string;
  jdText: string;
  scoreRunId: number | null;
}

export const emptyDraft = (roleId: number | "new" = "new"): RoleDraft => ({
  roleId,
  title: "",
  level: "Mid",
  company: "",
  jdText: "",
  scoreRunId: null,
});

export const MIN_JD = 40;

/** Why the draft cannot start yet, or null when it can. */
export function draftProblem(d: RoleDraft): string | null {
  if (d.roleId !== "new") return null;
  if (!d.title.trim() && d.scoreRunId === null) return "Give the role a title, or start from a CV score.";
  if (d.jdText.trim() && d.jdText.trim().length < MIN_JD)
    return `A job description needs at least ${MIN_JD} characters. Leave it empty to skip it.`;
  return null;
}
