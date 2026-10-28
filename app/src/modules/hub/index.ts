import { lazy } from "react";
import type { ModuleDef } from "../../shell/types";

/**
 * Hub module: where you stand across every module, for the role you are preparing for.
 * Enable with VITE_ENABLED_MODULES=design,hub (and ENABLED_MODULES on the server). It shows whatever the other enabled modules provide.
 */
const def: ModuleDef = {
  id: "hub",
  title: "Hub",
  hashPrefix: "#/hub",
  requires: ["backend", "auth"],
  flag: "hub",
  Screen: lazy(() => import("./Screen")),
};

export default def;
