import type { ComponentType } from "react";

export type Requirement = "backend" | "auth";

/** What a feature module exports from its index.ts. Design Canvas is built in and has no Screen. */
export interface ModuleDef {
  id: string;
  title: string;
  /** URL hash prefix the module owns, for example "#/cv". Empty for the built-in Design module. */
  hashPrefix: string;
  requires: Requirement[];
  /** name matched against VITE_ENABLED_MODULES */
  flag: string;
  Screen?: ComponentType<{ rest: string }>;
}

export interface Access {
  backendOnline: boolean;
  signedIn: boolean;
}

export type Availability = "ok" | "needs-backend" | "needs-signin";
