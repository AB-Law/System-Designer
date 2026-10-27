import type { ModuleDef } from "../../shell/types";

/**
 * Design Canvas as a module. Kept apart from index.ts on purpose: the shell imports this definition, and
 * index.ts re-exports components that import the shell, so putting both together would create an import cycle.
 */
export const DESIGN: ModuleDef = { id: "design", title: "Design", hashPrefix: "", requires: [], flag: "design" };
