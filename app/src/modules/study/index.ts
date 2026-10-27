import { lazy } from "react";
import type { ModuleDef } from "../../shell/types";

/**
 * Study module: spaced-repetition flashcards and (with study.maps) mind maps.
 * Enable with VITE_ENABLED_MODULES=design,study (and ENABLED_MODULES on the server).
 */
const def: ModuleDef = {
  id: "study",
  title: "Study",
  hashPrefix: "#/study",
  requires: ["backend", "auth"],
  flag: "study",
  Screen: lazy(() => import("./Screen")),
};

export default def;
