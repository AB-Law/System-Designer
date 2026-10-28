/** Routes inside `#/interview`. Pure parse/format pair; unknown paths land on the session list. */
export type InterviewRoute =
  | { name: "sessions" }
  | { name: "new"; roleId: number | null; scoreRunId?: number }
  | { name: "session"; sessionId: number }
  | { name: "docs" };

const id = (s: string | undefined): number | null => (s && /^\d{1,9}$/.test(s) ? Number(s) : null);

export function parse(rest: string): InterviewRoute {
  const [a, b, ...more] = rest.split("/").filter(Boolean);
  if (a === "new" && b === undefined) return { name: "new", roleId: null };
  if (a === "new" && id(b) !== null && !more.length) return { name: "new", roleId: id(b) };
  if (a === "new" && b === "score" && id(more[0]) !== null && more.length === 1)
    return { name: "new", roleId: null, scoreRunId: id(more[0])! };
  if (a === "session" && id(b) !== null && !more.length) return { name: "session", sessionId: id(b)! };
  if (a === "docs" && b === undefined) return { name: "docs" };
  return { name: "sessions" };
}

export function format(r: InterviewRoute): string {
  switch (r.name) {
    case "sessions":
      return "";
    case "new":
      return r.scoreRunId !== undefined ? `new/score/${r.scoreRunId}` : r.roleId === null ? "new" : `new/${r.roleId}`;
    case "session":
      return `session/${r.sessionId}`;
    case "docs":
      return "docs";
  }
}

export const hashFor = (r: InterviewRoute): string => {
  const rest = format(r);
  return rest ? `#/interview/${rest}` : "#/interview";
};

export const go = (r: InterviewRoute): void => {
  window.location.hash = hashFor(r);
};

/** Which top tab a route belongs to. */
export const tabOf = (r: InterviewRoute): "sessions" | "new" | "docs" =>
  r.name === "new" ? "new" : r.name === "docs" ? "docs" : "sessions";
