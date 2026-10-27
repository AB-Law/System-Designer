import { lazy } from "react";
import type { ModuleDef } from "../../shell/types";

/** An empty module that proves the frame works. Enable it with VITE_ENABLED_MODULES=design,sandbox. */
const def: ModuleDef = {
  id: "sandbox",
  title: "Sandbox",
  hashPrefix: "#/sandbox",
  requires: [],
  flag: "sandbox",
  Screen: lazy(() => import("./Screen")),
};

export default def;
