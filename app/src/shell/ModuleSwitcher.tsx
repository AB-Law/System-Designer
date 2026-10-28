import { useStore } from "../store";
import { goModule } from "./route";
import { useActiveModule, useModules } from "./useActiveModule";

/** Top-level module nav. Draws nothing unless more than one module is enabled, so the top bar is unchanged today. */
export function ModuleSwitcher() {
  const modules = useModules();
  const active = useActiveModule();
  const setLandingSeen = useStore((s) => s.setLandingSeen);
  if (modules.length < 2) return null;
  const activeId = active?.module.id ?? "design";
  return (
    <nav className="module-nav" aria-label="Modules">
      {modules.map((m) => (
        <button
          key={m.id}
          type="button"
          className={m.id === activeId ? "on" : ""}
          aria-current={m.id === activeId ? "page" : undefined}
          onClick={() => {
            if (!m.hashPrefix) setLandingSeen(true); // choosing Design skips the landing page
            goModule(m, modules);
          }}
        >
          {m.title}
        </button>
      ))}
    </nav>
  );
}
