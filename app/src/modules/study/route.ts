/** Routes inside `#/study`. Pure parse/format pair; unknown paths land on the deck list. */
export type StudyRoute =
  | { name: "decks" }
  | { name: "due" }
  | { name: "deck"; deckId: number }
  | { name: "review"; deckId: number | null }
  | { name: "maps" }
  | { name: "map"; mapId: number };

const id = (s: string | undefined): number | null => (s && /^\d{1,9}$/.test(s) ? Number(s) : null);

export function parse(rest: string): StudyRoute {
  const [a, b, ...more] = rest.split("/").filter(Boolean);
  if (a === "due" && b === undefined) return { name: "due" };
  if (a === "deck" && id(b) !== null && !more.length) return { name: "deck", deckId: id(b)! };
  if (a === "review" && b === undefined) return { name: "review", deckId: null };
  if (a === "review" && id(b) !== null && !more.length) return { name: "review", deckId: id(b)! };
  if (a === "maps" && b === undefined) return { name: "maps" };
  if (a === "map" && id(b) !== null && !more.length) return { name: "map", mapId: id(b)! };
  return { name: "decks" };
}

export function format(r: StudyRoute): string {
  switch (r.name) {
    case "decks":
      return "";
    case "due":
      return "due";
    case "deck":
      return `deck/${r.deckId}`;
    case "review":
      return r.deckId === null ? "review" : `review/${r.deckId}`;
    case "maps":
      return "maps";
    case "map":
      return `map/${r.mapId}`;
  }
}

export const hashFor = (r: StudyRoute): string => {
  const rest = format(r);
  return rest ? `#/study/${rest}` : "#/study";
};

export const go = (r: StudyRoute): void => {
  window.location.hash = hashFor(r);
};

export const tabOf = (r: StudyRoute): "decks" | "due" | "maps" =>
  r.name === "due" || r.name === "review" ? "due" : r.name === "maps" || r.name === "map" ? "maps" : "decks";
