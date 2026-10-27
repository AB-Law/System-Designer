import { lazy } from "react";
import type { ModuleDef } from "../../shell/types";

/** CV module: upload and read CVs, score them against a job description, rewrite suggestions, history. Enable with VITE_ENABLED_MODULES=design,cv. */
const def: ModuleDef = {
  id: "cv",
  title: "CV",
  hashPrefix: "#/cv",
  requires: ["backend", "auth"],
  flag: "cv",
  Screen: lazy(() => import("./Screen")),
};

export default def;
