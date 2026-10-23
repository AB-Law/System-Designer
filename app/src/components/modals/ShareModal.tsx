import { useMemo, useRef, useState } from "react";
import { call, cloudOn, backend } from "../../api";
import { docToDesign, encodeShareHash, sanitizeDoc, toDoc, type DesignDoc } from "../../cloud/doc";
import { analyze } from "../../sim/analyze";
import { useProblem, useStore } from "../../store";
import { when } from "../canvas/VersionsTab";

const NOW = "now";

function copy(text: string, done: () => void) {
  navigator.clipboard?.writeText(text).then(done, done);
}

export function ShareModal() {
  const problem = useProblem();
  const versions = useStore((s) => s.versions);
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const user = useStore((s) => s.user);
  const setAuthOpen = useStore((s) => s.setAuthOpen);
  const importDoc = useStore((s) => s.importDoc);
  const close = () => useStore.getState().setShareOpen(false);

  const [pick, setPick] = useState(NOW);
  const [label, setLabel] = useState("");
  const [hashLink, setHashLink] = useState("");
  const [serverLink, setServerLink] = useState("");
  const [copied, setCopied] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const current = useMemo(() => toDoc(nodes, edges), [nodes, edges]);
  const doc: DesignDoc | undefined = pick === NOW ? current : versions.find((v) => v.id === pick)?.doc;
  const name = label.trim() || (pick === NOW ? "Shared design" : (versions.find((v) => v.id === pick)?.label ?? "Shared design"));
  const origin = location.origin + location.pathname;
  const flash = (what: string) => {
    setCopied(what);
    setTimeout(() => setCopied(""), 1600);
  };

  const makeHashLink = async () => {
    if (!problem || !doc) return;
    setError("");
    setServerLink("");
    setHashLink(origin + "#" + (await encodeShareHash({ problemId: problem.id, label: name, doc })));
  };

  const makeServerLink = async () => {
    if (!problem || !doc) return;
    setBusy(true);
    setError("");
    try {
      let score: number | undefined;
      try {
        score = analyze(docToDesign(doc), problem).score;
      } catch {
        /* a half-built design still shares, just without a score */
      }
      const r = await call<{ token: string }>("/shares", "POST", { problemId: problem.id, label: name, score, doc });
      setServerLink(`${origin}#share=${r.token}`);
      setHashLink("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the link.");
    }
    setBusy(false);
  };

  const download = () => {
    if (!problem || !doc) return;
    const blob = new Blob([JSON.stringify({ app: "design-canvas", v: 1, problem: problem.id, label: name, doc }, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${problem.id}-${name.replace(/[^\w-]+/g, "-").toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const onFile = async (f: File | undefined) => {
    if (!f || !problem) return;
    setError("");
    if (f.size > 400_000) return setError("That file is too large to be a design.");
    try {
      const j = JSON.parse(await f.text()) as { problem?: string; doc?: unknown; nodes?: unknown };
      const imported = sanitizeDoc(j.doc ?? j);
      if (!imported || imported.nodes.length === 0) return setError("That file does not hold a design this app can read.");
      if (j.problem && j.problem !== problem.id)
        return setError(`That design is for a different problem (${j.problem}). Switch problem first.`);
      if (nodes.length > 0 && !confirm("Replace the canvas with this design? Your current canvas is saved as a version first.")) return;
      await importDoc(imported);
      close();
    } catch {
      setError("That file is not valid JSON.");
    }
  };

  return (
    <div className="overlay" onClick={close}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Share or export">
        <button className="x" onClick={close} aria-label="Close">
          ×
        </button>
        <h3 className="m-h">Share or export</h3>
        <div className="m-body">
          <div className="cmp-pick">
            <div className="col">
              <label htmlFor="sh-which">What to share</label>
              <select
                id="sh-which"
                value={pick}
                onChange={(e) => {
                  setPick(e.target.value);
                  setHashLink("");
                  setServerLink("");
                }}
              >
                <option value={NOW}>Current canvas</option>
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label} · {when(v.created)}
                  </option>
                ))}
              </select>
            </div>
            <div className="col">
              <label htmlFor="sh-name">Title</label>
              <input id="sh-name" value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} placeholder="Shared design" />
            </div>
          </div>
          <p className="muted">
            A shared design is a copy of what you pick right now. Later changes to your canvas do not change it. Block notes are included,
            so read them over first.
          </p>

          <section className="share-card">
            <h4 className="h">Revocable link</h4>
            {backend.online ? (
              cloudOn() ? (
                <>
                  <p className="muted">
                    Anyone with the link can look at it, and signed-in people can comment. You can turn it off later from the home page.
                  </p>
                  {serverLink ? (
                    <div className="share-row">
                      <input readOnly value={serverLink} onFocus={(e) => e.target.select()} aria-label="Link" />
                      <button className="btn" onClick={() => copy(serverLink, () => flash("server"))}>
                        {copied === "server" ? "Copied" : "Copy"}
                      </button>
                    </div>
                  ) : (
                    <button className="btn primary" disabled={busy || !doc?.nodes.length} onClick={() => void makeServerLink()}>
                      {busy ? "Creating…" : "Create link"}
                    </button>
                  )}
                </>
              ) : (
                <p className="muted">
                  <button className="link" onClick={() => (close(), setAuthOpen(true))}>
                    Sign in
                  </button>{" "}
                  to make a link you can turn off{user ? "" : " and let people comment on your design"}.
                </p>
              )
            ) : (
              <p className="muted">Needs the Design Canvas server, which is not running.</p>
            )}
          </section>

          <section className="share-card">
            <h4 className="h">Link with the design inside</h4>
            <p className="muted">
              Works without an account or a server, anywhere this app is open. It cannot be turned off, so only send it to people you trust.
            </p>
            {hashLink ? (
              <>
                <div className="share-row">
                  <input readOnly value={hashLink} onFocus={(e) => e.target.select()} aria-label="Link" />
                  <button className="btn" onClick={() => copy(hashLink, () => flash("hash"))}>
                    {copied === "hash" ? "Copied" : "Copy"}
                  </button>
                </div>
                {hashLink.length > 6000 && (
                  <small className="muted">This link is long. A file or a revocable link may travel better in chat apps.</small>
                )}
              </>
            ) : (
              <button className="btn" disabled={!doc?.nodes.length} onClick={() => void makeHashLink()}>
                Create link
              </button>
            )}
          </section>

          <section className="share-card">
            <h4 className="h">File</h4>
            <div className="share-row">
              <button className="btn" disabled={!doc?.nodes.length} onClick={download}>
                Download as file
              </button>
              <button className="btn ghost" onClick={() => file.current?.click()}>
                Import a file…
              </button>
              <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
            </div>
          </section>
          {error && (
            <p className="err" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="m-foot">
          <button className="btn ghost" onClick={close}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
