import { useEffect, useState } from "react";
import { activeModules } from "./registry";
import { parseModuleHash } from "./route";
import type { ModuleDef } from "./types";

const MODULES = activeModules();

/** Every enabled module (Design first). */
export const useModules = (): ModuleDef[] => MODULES;

/** The non-Design module the URL points at, or null when Design Canvas should render. Follows `hashchange`. */
export function useActiveModule(): { module: ModuleDef; rest: string } | null {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const on = () => setHash(window.location.hash);
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  const found = parseModuleHash(hash, MODULES);
  return found && found.module.id !== "design" ? found : null; // Design draws itself; the host is for the others
}
