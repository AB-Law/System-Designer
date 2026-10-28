import { call } from "../../api";
import type { Card, CardKind, Deck, MapSummary, MindMap, Rating, StudyStats } from "./types";

export const studyApi = {
  decks: () => call<Deck[]>("/study/decks"),
  createDeck: (name: string, parentId?: number | null) => call<Deck>("/study/decks", "POST", { name, parentId: parentId ?? null }),
  generateDeck: (body: {
    name?: string;
    sourceKind: "topic" | "glossary" | "lesson" | "jd" | "score_run" | "interview_weakness" | "document";
    sourceRef?: string;
    parentId?: number | null;
  }) => call<Deck & { jobId: string }>("/study/decks/generate", "POST", body),
  confirmDeck: (id: number) => call<Deck>(`/study/decks/${id}/confirm`, "POST"),
  lessons: () => call<{ id: string; title: string }[]>("/study/content/lessons"),
  deck: (id: number) => call<Deck>(`/study/decks/${id}`),
  patchDeck: (id: number, body: { name?: string; parentId?: number | null }) => call<Deck>(`/study/decks/${id}`, "PATCH", body),
  removeDeck: (id: number) => call<{ ok: boolean }>(`/study/decks/${id}`, "DELETE"),
  cards: (deckId: number) => call<Card[]>(`/study/decks/${deckId}/cards`),
  createCard: (deckId: number, body: { kind?: CardKind; front: string; back: string }) =>
    call<Card>(`/study/decks/${deckId}/cards`, "POST", body),
  patchCard: (id: number, body: { kind?: CardKind; front?: string; back?: string }) => call<Card>(`/study/cards/${id}`, "PATCH", body),
  removeCard: (id: number) => call<{ ok: boolean }>(`/study/cards/${id}`, "DELETE"),
  due: (deckId?: number) => call<Card[]>(`/study/decks/due${deckId != null ? `?deckId=${deckId}` : ""}`),
  review: (id: number, rating: Rating) => call<Card>(`/study/cards/${id}/review`, "POST", { rating }),
  deckStats: (id: number) => call<StudyStats>(`/study/decks/${id}/stats`),
  stats: () => call<StudyStats>("/study/decks/stats"),
  /** Past CV scores, each of which holds the job description it was scored against. Fails when the CV module is off. */
  scoreRuns: () => call<{ id: number; jdTitle: string; cvName?: string }[]>("/cv/score/history"),
  maps: () => call<MapSummary[]>("/study/maps"),
  createMap: (body: { sourceKind: "lesson" | "jd" | "score_run" | "document"; sourceRef: string }) =>
    call<MindMap>("/study/maps", "POST", body),
  map: (id: number) => call<MindMap>(`/study/maps/${id}`),
  regenerateMap: (id: number) => call<MindMap>(`/study/maps/${id}/regenerate`, "POST"),
  patchNode: (mapId: number, nodeId: string, body: { label?: string; summary?: string; delete?: boolean; addChildLabel?: string }) =>
    call<MindMap>(`/study/maps/${mapId}/nodes/${nodeId}`, "PATCH", body),
  nodeDeck: (mapId: number, nodeId: string) => call<Deck>(`/study/maps/${mapId}/nodes/${nodeId}/deck`, "POST"),
  nodeChat: async (mapId: number, nodeId: string, message: string, onToken: (t: string) => void): Promise<string> => {
    const res = await fetch(`/api/study/maps/${mapId}/nodes/${nodeId}/chat`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    if (!res.ok || !res.body) throw new Error("Chat failed");
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let full = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split("\n\n");
      buf = parts.pop() ?? "";
      for (const frame of parts) {
        const ev = frame
          .split("\n")
          .find((l) => l.startsWith("event: "))
          ?.slice(7);
        const dataLine = frame.split("\n").find((l) => l.startsWith("data: "));
        if (!dataLine) continue;
        const data = JSON.parse(dataLine.slice(6)) as { text?: string; message?: string };
        if (ev === "token" && data.text) {
          full += data.text;
          onToken(data.text);
        }
        if (ev === "done" && data.text) full = data.text;
        if (ev === "error") throw new Error(data.message || "Chat error");
      }
    }
    return full;
  },
};
