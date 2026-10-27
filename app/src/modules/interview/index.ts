import { lazy } from "react";
import type { ModuleDef } from "../../shell/types";

/**
 * Interview module: practise interviews for a role with a mock interviewer, then get feedback.
 * Enable with VITE_ENABLED_MODULES=design,interview (and ENABLED_MODULES on the server).
 * Slice flag interview.voice turns on mic transcription and spoken interviewer replies.
 */
const def: ModuleDef = {
  id: "interview",
  title: "Interview",
  hashPrefix: "#/interview",
  requires: ["backend", "auth"],
  flag: "interview",
  Screen: lazy(() => import("./Screen")),
};

export default def;
