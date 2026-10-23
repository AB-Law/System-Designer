import { useCallback, useEffect, useState } from "react";
import { call } from "../../api";
import { useStore } from "../../store";

interface Cohort {
  id: number;
  name: string;
  members: number;
  mine: boolean;
  code: string | null;
}
interface Row {
  username: string;
  owner: boolean;
  you: boolean;
  done: number;
  points: number;
  best: Record<string, { score: number; done: number }>;
}

export function HomeCohorts() {
  const [list, setList] = useState<Cohort[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(() => {
    call<Cohort[]>("/cohorts").then(setList, (e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const act = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not work.");
    }
  };

  return (
    <section className="home-card">
      <h2>Cohorts</h2>
      <p className="muted">
        A cohort is a small group, such as a study group, that can see each other's progress. Members see user names and scores only, never
        designs.
      </p>
      {error && <p className="err">{error}</p>}
      <ul className="row-list">
        {(list ?? []).map((c) => (
          <li key={c.id} className="cohort">
            <div className="cohort-top">
              <button className="link strong" aria-expanded={open === c.id} onClick={() => setOpen(open === c.id ? null : c.id)}>
                {open === c.id ? "⌄" : "›"} {c.name}
              </button>
              <small>
                {c.members} member{c.members === 1 ? "" : "s"}
                {c.code && (
                  <>
                    {" "}
                    · join code <code>{c.code}</code>
                  </>
                )}
              </small>
              <span className="row-actions">
                {c.mine ? (
                  <button
                    className="btn small danger"
                    onClick={() => confirm("Delete this cohort for everyone?") && void act(() => call(`/cohorts/${c.id}`, "DELETE"))}
                  >
                    Delete
                  </button>
                ) : (
                  <button className="btn small ghost" onClick={() => void act(() => call(`/cohorts/${c.id}/leave`, "POST"))}>
                    Leave
                  </button>
                )}
              </span>
            </div>
            {open === c.id && <Board id={c.id} />}
          </li>
        ))}
      </ul>
      {list && list.length === 0 && <p className="muted">You are not in a cohort yet.</p>}
      <div className="cohort-forms">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void act(async () => {
              await call("/cohorts", "POST", { name });
              setName("");
            });
          }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New cohort name"
            maxLength={60}
            aria-label="New cohort name"
          />
          <button className="btn small" disabled={name.trim().length < 2}>
            Create
          </button>
        </form>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void act(async () => {
              await call("/cohorts/join", "POST", { code });
              setCode("");
            });
          }}
        >
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Join with a code"
            maxLength={20}
            aria-label="Cohort join code"
          />
          <button className="btn small" disabled={code.trim().length < 4}>
            Join
          </button>
        </form>
      </div>
    </section>
  );
}

function Board({ id }: { id: number }) {
  const problems = useStore((s) => s.problems);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    call<{ members: Row[] }>(`/cohorts/${id}/board`).then(
      (r) => setRows(r.members),
      (e: Error) => setError(e.message),
    );
  }, [id]);

  if (error) return <p className="err">{error}</p>;
  if (!rows) return <p className="muted">Loading…</p>;
  return (
    <div className="board" role="table" aria-label="Leaderboard">
      <table className="tbl">
        <thead>
          <tr>
            <th>#</th>
            <th>Name</th>
            <th>Done</th>
            <th>Points</th>
            <th>Problems</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.username} className={r.you ? "me" : ""}>
              <td>{i + 1}</td>
              <td>
                {r.username}
                {r.owner && <small> · owner</small>}
                {r.you && <small> · you</small>}
              </td>
              <td>
                {r.done}/{problems.length}
              </td>
              <td>{r.points}</td>
              <td>
                <span className="dots">
                  {problems.map((p) => {
                    const b = r.best[p.id];
                    return (
                      <i
                        key={p.id}
                        className={b ? (b.done ? "d" : "a") : ""}
                        title={`${p.title}: ${b ? `best ${b.score}${b.done ? ", done" : ""}` : "not tried"}`}
                      />
                    );
                  })}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <small className="muted">
        Done means every scenario passed with a score of 80 or more. Points add up each person's best score per problem.
      </small>
    </div>
  );
}
