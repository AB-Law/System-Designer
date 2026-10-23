import { useMemo, useState } from "react";
import { GLOSSARY } from "../../roadmap";
import { useStore } from "../../store";

export function GlossaryPanel() {
  const [q, setQ] = useState("");
  const problems = useStore((s) => s.problems);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return GLOSSARY;
    return GLOSSARY.filter((g) => g.term.toLowerCase().includes(needle) || g.plain.toLowerCase().includes(needle));
  }, [q]);

  const titleOf = (id: string) => problems.find((p) => p.id === id)?.title ?? id.replace(/_/g, " ");

  return (
    <div className="rm-glossary">
      <label className="rm-search-label" htmlFor="glossary-search">
        Search terms
      </label>
      <input
        id="glossary-search"
        className="rm-search"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="cache, queue, idempotent…"
        autoComplete="off"
      />
      <p className="muted rm-glossary-count">
        {filtered.length} of {GLOSSARY.length} terms
      </p>
      <ul className="rm-glossary-list">
        {filtered.map((g) => (
          <li key={g.term} className="rm-glossary-item">
            <div className="rm-glossary-term">{g.term}</div>
            <p>{g.plain}</p>
            <p className="muted">First met in: {titleOf(g.where)}</p>
          </li>
        ))}
        {filtered.length === 0 && <li className="muted">No terms match that search.</li>}
      </ul>
    </div>
  );
}
