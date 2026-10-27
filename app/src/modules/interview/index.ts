import { lazy } from "react";
import type { ModuleDef } from "../../shell/types";

/** Interview module: practise interviews for a role with a mock interviewer, then get feedback on every answer. Enable with VITE_ENABLED_MODULES=design,interview. */
const def: ModuleDef = {
  id: "interview",
  title: "Interview",
  hashPrefix: "#/interview",
  requires: ["backend", "auth"],
  flag: "interview",
  Screen: lazy(() => import("./Screen")),
};

export default def;
