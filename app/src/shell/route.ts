import type { ModuleDef } from "./types";

/** The module that owns a hash such as `#/cv` or `#/cv/upload`, with the rest of the path. Null means Design Canvas. */
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
 * Switch module from the nav. Leaving a module for Design clears the hash; if no module owns the hash
 * (Design's own `#/learn/...` links), it is left alone so Design Canvas behaves exactly as before.
 */
export function goModule(m: ModuleDef, modules: ModuleDef[]): void {
  if (m.hashPrefix) window.location.hash = m.hashPrefix;
  else if (parseModuleHash(window.location.hash, modules)) window.location.hash = "";
}
