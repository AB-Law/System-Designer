import { create } from "zustand";
import { errText } from "../../shared/async";
import { cvApi } from "./api";
import type { CvSummary } from "./types";

export { errText };

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
