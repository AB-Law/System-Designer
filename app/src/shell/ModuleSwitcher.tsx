import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { goModule } from "./route";
import { useActiveModule, useModules } from "./useActiveModule";

/** Top-level module nav. Draws nothing unless more than one module is enabled, so the top bar is unchanged today. */
export function ModuleSwitcher({ badges = {} }: { badges?: Record<string, number> }) {
  const modules = useModules();
  const active = useActiveModule();
  const setLandingSeen = useStore((s) => s.setLandingSeen);
  const activeId = active?.module.id ?? "design";
  const nav = useRef<HTMLElement>(null);
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({});
  const [pill, setPill] = useState<{ x: number; w: number } | null>(null);
  const [settled, setSettled] = useState(false);

  // The highlight is one element that slides to the active item, so changing module reads as movement, not a swap.
  useLayoutEffect(() => {
    const b = buttons.current[activeId];
    if (b) setPill({ x: b.offsetLeft, w: b.offsetWidth });
  }, [activeId, modules.length]);
  useEffect(() => {
    const t = window.setTimeout(() => setSettled(true), 50);
    const el = nav.current;
    if (!el || typeof ResizeObserver === "undefined") return () => window.clearTimeout(t);
    const ro = new ResizeObserver(() => {
      const b = buttons.current[activeId];
      if (b) setPill({ x: b.offsetLeft, w: b.offsetWidth });
    });
    ro.observe(el);
    return () => {
      window.clearTimeout(t);
      ro.disconnect();
    };
  }, [activeId]);

  if (modules.length < 2) return null;
  return (
    <nav className={"module-nav" + (settled ? " settled" : "")} aria-label="Modules" ref={nav}>
      {pill && <span className="nav-pill" aria-hidden="true" style={{ transform: `translateX(${pill.x}px)`, width: pill.w }} />}
      {modules.map((m) => (
        <button
          key={m.id}
          type="button"
          ref={(el) => {
            buttons.current[m.id] = el;
          }}
          className={m.id === activeId ? "on" : ""}
          aria-current={m.id === activeId ? "page" : undefined}
          onClick={() => {
            if (!m.hashPrefix) setLandingSeen(true); // choosing Design skips the landing page
            goModule(m, modules);
          }}
        >
          {m.title}
          {badges[m.id] > 0 && (
            <span className="nav-count" aria-label={`${badges[m.id]} due`}>
              {badges[m.id]}
            </span>
          )}
        </button>
      ))}
    </nav>
  );
}
