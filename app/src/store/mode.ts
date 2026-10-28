import { create } from "zustand";
import { lsGet, lsSet } from "../api";

const KEY = "dc:placeMode";

/** "build": a block you add stays unselected, so the block list stays open. "configure": it opens its settings straight away. */
export type PlaceMode = "build" | "configure";

interface ModeStore {
  mode: PlaceMode;
  setMode: (m: PlaceMode) => void;
}

export const useMode = create<ModeStore>((set) => ({
  mode: lsGet<PlaceMode>(KEY, "build") === "configure" ? "configure" : "build",
  setMode: (mode) => {
    lsSet(KEY, mode);
    set({ mode });
  },
}));
