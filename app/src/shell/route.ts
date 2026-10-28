import type { ModuleDef } from "./types";

/** Design Canvas has its own address like every other module; the empty address is only an entry point (see `store.init`). */
export const DESIGN_HASH = "#/design";

/** The module that owns a hash such as `#/cv` or `#/cv/upload`, with the rest of the path. Null means no module (Design's own `#/learn/...` and share links). */
export function parseModuleHash(hash: string, modules: ModuleDef[]): { module: ModuleDef; rest: string } | null {
  for (const m of modules) {
    if (!m.hashPrefix) continue;
    if (hash === m.hashPrefix) return { module: m, rest: "" };
    if (hash.startsWith(m.hashPrefix + "/")) return { module: m, rest: hash.slice(m.hashPrefix.length + 1) };
  }
  return null;
}

export function moduleHash(m: ModuleDef, rest = ""): string {
  return rest ? `${m.hashPrefix}/${rest}` : m.hashPrefix;
}

/**
 * The address to set when switching to `m` from `current`, or null to leave it alone. Design's own links (`#/learn/...`,
 * a shared design) are Design already, so choosing Design while on one of them changes nothing.
 */
export function hashAfterSwitch(m: ModuleDef, current: string, modules: ModuleDef[]): string | null {
  if (m.id !== "design") return m.hashPrefix;
  const here = parseModuleHash(current, modules);
  return !current || (here && here.module.id !== "design") ? DESIGN_HASH : null;
}

export function goModule(m: ModuleDef, modules: ModuleDef[]): void {
  const next = hashAfterSwitch(m, window.location.hash, modules);
  if (next !== null) window.location.hash = next;
}
