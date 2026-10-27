import type { KeyboardEvent } from "react";

export interface TabDef {
  id: string;
  label: string;
}

/** Controlled tab strip with arrow-key movement. The caller renders the panel for the active id. */
export function Tabs({ tabs, active, onChange, label }: { tabs: TabDef[]; active: string; onChange: (id: string) => void; label: string }) {
  const move = (e: KeyboardEvent, i: number) => {
    const next = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : null;
    if (next === null) return;
    e.preventDefault();
    onChange(tabs[(next + tabs.length) % tabs.length].id);
  };
  return (
    <div className="ui-tabs" role="tablist" aria-label={label}>
      {tabs.map((t, i) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={t.id === active}
          tabIndex={t.id === active ? 0 : -1}
          className={t.id === active ? "on" : ""}
          onClick={() => onChange(t.id)}
          onKeyDown={(e) => move(e, i)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
