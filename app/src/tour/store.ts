import { create } from "zustand";
import { lsGet, lsSet } from "../api";

const KEY = (problemId: string) => `dc:tour:${problemId}`;

export type TourOutcome = "done" | "skipped";

interface TourStore {
  /** the tour running now */
  active: { problemId: string; step: number } | null;
  start: (problemId: string) => void;
  go: (step: number) => void;
  /** ends the tour and remembers that it was finished or skipped, so it is not offered again */
  end: (outcome: TourOutcome) => void;
}

export const useTour = create<TourStore>((set, get) => ({
  active: null,
  start: (problemId) => set({ active: { problemId, step: 0 } }),
  go: (step) => {
    const a = get().active;
    if (a) set({ active: { ...a, step } });
  },
  end: (outcome) => {
    const a = get().active;
    if (a) lsSet(KEY(a.problemId), outcome);
    set({ active: null });
  },
}));

/** Whether this browser has already seen (finished or skipped) the tour for a problem. */
export const tourSeen = (problemId: string): boolean => !!lsGet<string | null>(KEY(problemId), null);
export const markTourSeen = (problemId: string, outcome: TourOutcome) => lsSet(KEY(problemId), outcome);
