/** Routes inside `#/cv`. Pure parse/format pair; unknown paths land on the library. */
export type CvRoute =
  | { name: "library" }
  | { name: "review"; cvId: number }
  | { name: "score"; targetId?: number }
  | { name: "result"; runId: number }
  | { name: "rewrites"; runId: number }
  | { name: "history" }
  | { name: "compare"; a: number; b: number }
  | { name: "settings" };

const id = (s: string | undefined): number | null => (s && /^\d{1,9}$/.test(s) ? Number(s) : null);

export function parse(rest: string): CvRoute {
  const p = rest.split("/").filter(Boolean);
  const [a, b, c, d] = p;
  if (a === "cv" && id(b) !== null && p.length === 2) return { name: "review", cvId: id(b)! };
  if (a === "score" && p.length === 1) return { name: "score" };
  if (a === "score" && b === "target" && id(c) !== null && p.length === 3) return { name: "score", targetId: id(c)! };
  if (a === "score" && id(b) !== null && p.length === 2) return { name: "result", runId: id(b)! };
  if (a === "score" && id(b) !== null && c === "rewrites" && p.length === 3) return { name: "rewrites", runId: id(b)! };
  if (a === "history" && p.length === 1) return { name: "history" };
  if (a === "history" && b === "compare" && id(c) !== null && id(d) !== null && p.length === 4)
    return { name: "compare", a: id(c)!, b: id(d)! };
  if (a === "settings" && p.length === 1) return { name: "settings" };
  return { name: "library" };
}

export function format(r: CvRoute): string {
  switch (r.name) {
    case "library":
      return "";
    case "review":
      return `cv/${r.cvId}`;
    case "score":
      return r.targetId !== undefined ? `score/target/${r.targetId}` : "score";
    case "result":
      return `score/${r.runId}`;
    case "rewrites":
      return `score/${r.runId}/rewrites`;
    case "history":
      return "history";
    case "compare":
      return `history/compare/${r.a}/${r.b}`;
    case "settings":
      return "settings";
  }
}

export const hashFor = (r: CvRoute): string => {
  const rest = format(r);
  return rest ? `#/cv/${rest}` : "#/cv";
};

export const go = (r: CvRoute): void => {
  window.location.hash = hashFor(r);
};

/** Which top tab a route belongs to. */
export function tabOf(r: CvRoute): "library" | "score" | "history" | "settings" {
  if (r.name === "review" || r.name === "library") return "library";
  if (r.name === "score" || r.name === "result" || r.name === "rewrites") return "score";
  if (r.name === "history" || r.name === "compare") return "history";
  return "settings";
}
