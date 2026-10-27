import { create } from "zustand";
import { ApiError } from "../../api";
import { cvApi } from "./api";
import type { CvSummary } from "./types";

export const errText = (e: unknown): string => (e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong.");

interface CvState {
  cvs: CvSummary[] | null;
  error: string | null;
  loadCvs: () => Promise<CvSummary[]>;
}

/** The CV library, shared by the library, score and history screens. Everything else is loaded per screen. */
export const useCv = create<CvState>((set) => ({
  cvs: null,
  error: null,
  loadCvs: async () => {
    try {
      const cvs = await cvApi.list();
      set({ cvs, error: null });
      return cvs;
    } catch (e) {
      set({ error: errText(e) });
      return [];
    }
  },
}));
