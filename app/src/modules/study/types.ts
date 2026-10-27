export type CardKind = "basic" | "cloze";
export type Rating = "again" | "hard" | "good" | "easy";
export type DeckStatus = "ready" | "generating" | "review" | "failed";

export interface Deck {
  id: number;
  parentId: number | null;
  name: string;
  sourceKind: string;
  sourceRef: string;
  status: DeckStatus;
  jobId: string | null;
  created: number;
  dueCount: number;
  cardCount?: number;
}

export interface Card {
  id: number;
  deckId: number;
  kind: CardKind;
  front: string;
  back: string;
  easeFactor: number;
  intervalDays: number;
  due: number;
  reps: number;
  lapses: number;
  created: number;
}

export interface StudyStats {
  dueToday: number;
  streak: number;
  retention: number | null;
  totalReviews: number;
}

export interface MapSummary {
  id: number;
  sourceKind: string;
  sourceRef: string;
  version: number;
  status: string;
  jobId: string | null;
  created: number;
}

export interface MapNode {
  id: string;
  label: string;
  parentId: string | null;
  summary: string;
  sources: string[];
}

export interface MapEdge {
  id: string;
  source: string;
  target: string;
}

export interface MindMap extends MapSummary {
  nodes: MapNode[];
  edges: MapEdge[];
}
