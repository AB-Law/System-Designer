/** Routes inside `#/interview`. Pure parse/format pair; unknown paths land on the session list. */
export type InterviewRoute = { name: "sessions" } | { name: "new"; roleId: number | null } | { name: "session"; sessionId: number };

const id = (s: string | undefined): number | null => (s && /^\d{1,9}$/.test(s) ? Number(s) : null);

export function parse(rest: string): InterviewRoute {
  const [a, b, ...more] = rest.split("/").filter(Boolean);
  if (a === "new" && b === undefined) return { name: "new", roleId: null };
  if (a === "new" && id(b) !== null && !more.length) return { name: "new", roleId: id(b) };
  if (a === "session" && id(b) !== null && !more.length) return { name: "session", sessionId: id(b)! };
  return { name: "sessions" };
}

export function format(r: InterviewRoute): string {
  switch (r.name) {
    case "sessions":
      return "";
    case "new":
      return r.roleId === null ? "new" : `new/${r.roleId}`;
    case "session":
      return `session/${r.sessionId}`;
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
export const tabOf = (r: InterviewRoute): "sessions" | "new" => (r.name === "new" ? "new" : "sessions");
