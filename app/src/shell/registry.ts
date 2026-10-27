import { DESIGN } from "../modules/design/def";
import type { Access, Availability, ModuleDef } from "./types";

/** Design Canvas: always present, always first, owns every hash the other modules do not. */
export { DESIGN };

/** Parse a comma list such as "design,cv" (the build flag). Design is always on. */
export function enabledFlags(raw: string | undefined): Set<string> {
  const names = (raw ?? "design")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return new Set(["design", ...names]);
}

/** Keep the modules whose flag is on, Design first, no duplicate ids. */
export function enabledModules(defs: ModuleDef[], flags: Set<string>): ModuleDef[] {
  const seen = new Set<string>(["design"]);
  const out: ModuleDef[] = [DESIGN];
  for (const d of defs) {
    if (!flags.has(d.flag) || seen.has(d.id)) continue;
    seen.add(d.id);
    out.push(d);
  }
  return out;
}

export function availability(def: ModuleDef, access: Access): Availability {
  if (def.requires.includes("backend") && !access.backendOnline) return "needs-backend";
  if (def.requires.includes("auth") && !access.signedIn) return "needs-signin";
  return "ok";
}

// Definitions are small objects; each Screen is a lazy import, so module code stays out of the initial bundle.
const found = import.meta.glob<{ default: ModuleDef }>(["../modules/*/index.ts", "!../modules/design/index.ts"], { eager: true });

export function allDefinitions(): ModuleDef[] {
  return Object.values(found).map((m) => m.default);
}

export function activeModules(): ModuleDef[] {
  const raw = (import.meta.env as Record<string, string | undefined>).VITE_ENABLED_MODULES;
  return enabledModules(allDefinitions(), enabledFlags(raw));
}
