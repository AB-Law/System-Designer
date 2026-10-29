import { useEffect, useMemo, useRef, useState } from "react";
import { featureOn } from "../shell/registry";
import { useModules } from "../shell/useActiveModule";
import { useStore } from "../store";

interface Item {
  id: string;
  label: string;
  hint: string;
  run: () => void;
}

/** Jump anywhere from the keyboard: type a few letters, arrow to a result, press Enter. Opened with Ctrl or Cmd and K. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const modules = useModules();
  const setView = useStore((s) => s.setView);
  const openLearn = useStore((s) => s.openLearn);
  const user = useStore((s) => s.user);
  const signOut = useStore((s) => s.signOut);
  const [q, setQ] = useState("");
  const [at, setAt] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const items = useMemo<Item[]>(() => {
    const has = (id: string) => modules.some((m) => m.id === id);
    const hash = (h: string) => () => {
      window.location.hash = h;
    };
    const list: Item[] = [
      {
        id: "design",
        label: "Design Canvas",
        hint: "Build and simulate",
        run: () => (setView("canvas"), (window.location.hash = "#/design")),
      },
      { id: "roadmap", label: "Learning roadmap", hint: "Design", run: () => (setView("roadmap"), (window.location.hash = "#/design")) },
      { id: "learn", label: "Learn the building blocks", hint: "Design", run: () => openLearn() },
    ];
    if (has("hub"))
      list.push(
        { id: "hub", label: "Hub", hint: "Where you stand", run: hash("#/hub") },
        { id: "targets", label: "Manage targets", hint: "Hub", run: hash("#/hub/targets") },
      );
    if (has("cv"))
      list.push(
        { id: "cv", label: "CV library", hint: "CV", run: hash("#/cv") },
        { id: "cv-score", label: "Score a CV", hint: "CV", run: hash("#/cv/score") },
      );
    if (has("interview"))
      list.push(
        { id: "iv", label: "My interviews", hint: "Interview", run: hash("#/interview") },
        { id: "iv-new", label: "New mock interview", hint: "Interview", run: hash("#/interview/new") },
      );
    if (has("study")) {
      list.push(
        { id: "study", label: "Study decks", hint: "Study", run: hash("#/study") },
        { id: "due", label: "Review due cards", hint: "Study", run: hash("#/study/due") },
      );
      if (featureOn("study.maps")) list.push({ id: "maps", label: "Mind maps", hint: "Study", run: hash("#/study/maps") });
    }
    if (user) list.push({ id: "out", label: "Sign out", hint: "Account", run: () => void signOut() });
    return list;
  }, [modules, user, setView, openLearn, signOut]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? items.filter((i) => i.label.toLowerCase().includes(t) || i.hint.toLowerCase().includes(t)) : items;
  }, [items, q]);

  useEffect(() => {
    if (open) {
      setQ("");
      setAt(0);
      requestAnimationFrame(() => input.current?.focus());
    }
  }, [open]);
  useEffect(() => setAt(0), [q]);

  if (!open) return null;
  const choose = (i: Item | undefined) => {
    if (!i) return;
    onClose();
    i.run();
  };

  return (
    <div className="cp-back" onMouseDown={onClose}>
      <div
        className="cp"
        role="dialog"
        aria-modal="true"
        aria-label="Go to"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            onClose();
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            setAt((a) => Math.min(shown.length - 1, a + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setAt((a) => Math.max(0, a - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            choose(shown[at]);
          }
        }}
      >
        <input
          ref={input}
          className="cp-input"
          placeholder="Go to…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Go to"
          aria-controls="cp-list"
          aria-activedescendant={shown[at] ? `cp-${shown[at].id}` : undefined}
        />
        <ul className="cp-list" id="cp-list" role="listbox">
          {shown.map((i, n) => (
            <li
              key={i.id}
              id={`cp-${i.id}`}
              role="option"
              aria-selected={n === at}
              className={n === at ? "on" : ""}
              onMouseMove={() => setAt(n)}
              onClick={() => choose(i)}
            >
              <span>{i.label}</span>
              <em>{i.hint}</em>
            </li>
          ))}
          {shown.length === 0 && <li className="cp-none">Nothing matches “{q}”.</li>}
        </ul>
      </div>
    </div>
  );
}
