import { useCallback, useEffect, useState } from "react";
import { call } from "../../api";
import { useStore } from "../../store";
import { when } from "../canvas/VersionsTab";

interface Share {
  token: string;
  problemId: string;
  label: string;
  score: number | null;
  created: number;
  revoked: boolean;
  comments: number;
}

export function HomeShares() {
  const problems = useStore((s) => s.problems);
  const [shares, setShares] = useState<Share[] | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const base = location.origin + location.pathname;

  const load = useCallback(() => {
    call<Share[]>("/shares").then(setShares, (e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const revoke = async (token: string) => {
    if (!confirm("Turn this link off? Anyone who has it will see that it no longer works.")) return;
    try {
      await call(`/shares/${token}`, "DELETE");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not revoke it.");
    }
  };

  const live = (shares ?? []).filter((s) => !s.revoked);
  const off = (shares ?? []).filter((s) => s.revoked);

  return (
    <section className="home-card">
      <h2>Your shared links</h2>
      <p className="muted">Create one from the Versions tab, then Share. You can switch a link off here at any time.</p>
      {error && <p className="err">{error}</p>}
      {shares && live.length === 0 && <p className="muted">No live links.</p>}
      <ul className="row-list">
        {live.map((s) => (
          <li key={s.token}>
            <div>
              <b>{s.label}</b>
              <small>
                {problems.find((p) => p.id === s.problemId)?.title ?? s.problemId} · {when(s.created)}
                {s.score !== null && ` · score ${s.score}`} · {s.comments} comment{s.comments === 1 ? "" : "s"}
              </small>
            </div>
            <div className="row-actions">
              <button
                className="btn small"
                onClick={() =>
                  void navigator.clipboard?.writeText(`${base}#share=${s.token}`).then(() => {
                    setCopied(s.token);
                    setTimeout(() => setCopied(""), 1500);
                  })
                }
              >
                {copied === s.token ? "Copied" : "Copy link"}
              </button>
              <a className="btn small ghost" href={`#share=${s.token}`}>
                Open
              </a>
              <button className="btn small danger" onClick={() => void revoke(s.token)}>
                Turn off
              </button>
            </div>
          </li>
        ))}
      </ul>
      {off.length > 0 && (
        <small className="muted">
          {off.length} link{off.length === 1 ? "" : "s"} turned off.
        </small>
      )}
    </section>
  );
}
