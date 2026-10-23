import { useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { BLOCK_MAP, money } from "../../blocks";
import { docToDesign } from "../../cloud/doc";
import { analyze } from "../../sim/analyze";
import { edgeProps, useStore } from "../../store";
import type { RunResult } from "../../types";
import { when } from "../canvas/VersionsTab";

function ViewNode({ data }: NodeProps<Node<{ blockId: string }>>) {
  const def = BLOCK_MAP[data.blockId];
  return (
    <div className={`bnode cat-${def.category}`}>
      {([Position.Top, Position.Right, Position.Bottom, Position.Left] as const).map((p) => (
        <Handle key={p} id={p} type="source" position={p} isConnectable={false} />
      ))}
      <div className="bn-label">{def.label}</div>
    </div>
  );
}
const nodeTypes = { block: ViewNode };

export function SharedView() {
  const shared = useStore((s) => s.shared);
  const error = useStore((s) => s.sharedError);
  const problems = useStore((s) => s.problems);
  const user = useStore((s) => s.user);
  const close = useStore((s) => s.closeShared);
  const openAsMine = useStore((s) => s.useSharedAsMine);
  const post = useStore((s) => s.postComment);
  const delComment = useStore((s) => s.deleteComment);
  const setAuthOpen = useStore((s) => s.setAuthOpen);
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const problem = problems.find((p) => p.id === shared?.problemId);
  const run: RunResult | null = useMemo(() => {
    if (!shared || !problem) return null;
    try {
      return analyze(docToDesign(shared.doc), problem);
    } catch {
      return null;
    }
  }, [shared, problem]);

  const flow = useMemo(() => {
    if (!shared) return { nodes: [] as Node<{ blockId: string }>[], edges: [] as Edge[] };
    return {
      nodes: shared.doc.nodes.map(
        (n) =>
          ({
            id: n.id,
            type: "block",
            position: n.position,
            data: { blockId: n.data.blockId },
            draggable: false,
            selectable: false,
            connectable: false,
          }) as Node<{ blockId: string }>,
      ),
      edges: shared.doc.edges.map(
        (e) =>
          ({
            id: e.id,
            source: e.source,
            target: e.target,
            sourceHandle: e.sourceHandle,
            targetHandle: e.targetHandle,
            ...edgeProps(e.kind),
          }) as Edge,
      ),
    };
  }, [shared]);

  if (!shared) {
    return (
      <div className="shared-screen">
        <div className="shared-main">
          <h1>This design cannot be shown</h1>
          <p className="err">{error ?? "The link is not valid."}</p>
          <button className="btn primary" onClick={close}>
            Back to home
          </button>
        </div>
      </div>
    );
  }

  const notes = shared.doc.nodes.filter((n) => n.data.responsibilities.length > 0);
  const send = async () => {
    setBusy(true);
    const e = await post(text);
    setBusy(false);
    if (e) setErr(e);
    else {
      setText("");
      setErr("");
    }
  };

  return (
    <div className="shared-screen">
      <div className="shared-main">
        <div className="shared-head">
          <button className="btn small ghost" onClick={close}>
            ‹ Home
          </button>
          <div>
            <h1>{shared.label}</h1>
            <p className="muted">
              {problem?.title ?? shared.problemId}
              {shared.owner && ` · shared by ${shared.owner}`}
              {shared.created && ` · ${when(shared.created)}`}
              {shared.source === "link" && " · from a link"}
            </p>
          </div>
          <button className="btn primary" onClick={() => void openAsMine()}>
            Open as my copy
          </button>
        </div>
        {error && <p className="err">{error}</p>}

        <div className="shared-canvas" aria-label="The shared design (read only)">
          <ReactFlowProvider>
            <ReactFlow
              nodes={flow.nodes}
              edges={flow.edges}
              nodeTypes={nodeTypes}
              connectionMode={ConnectionMode.Loose}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable={false}
              fitView
              fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
              minZoom={0.3}
              proOptions={{ hideAttribution: true }}
            >
              <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} />
            </ReactFlow>
          </ReactFlowProvider>
        </div>

        <div className="shared-cols">
          <section>
            <h4 className="h">What the simulator says</h4>
            {run ? (
              <>
                <p>
                  Score <b>{run.score}</b>/100 · {run.scenarios.filter((s) => s.pass).length} of {run.scenarios.length} scenarios pass
                  {run.budget !== undefined && (
                    <>
                      {" "}
                      · <span className={run.cost > run.budget ? "cmp-down" : ""}>{money(run.cost)}</span> of {money(run.budget)} a month
                    </>
                  )}
                </p>
                <ul className="bul">
                  {run.scenarios.map((s) => (
                    <li key={s.scenarioId}>
                      <span className={`res ${s.pass ? "pass" : "fail"}`}>{s.pass ? "Pass" : "Fail"}</span> {s.title}
                    </li>
                  ))}
                </ul>
                <small className="muted">Worked out here from the design itself, not taken from the sender.</small>
              </>
            ) : (
              <p className="muted">This problem is not in your copy of the app, so it cannot be run.</p>
            )}
          </section>
          <section>
            <h4 className="h">Notes from the author</h4>
            {notes.length === 0 ? (
              <p className="muted">No notes on any block.</p>
            ) : (
              notes.map((n) => (
                <div key={n.id} className="shared-note">
                  <b>{BLOCK_MAP[n.data.blockId]?.label}</b>
                  {n.data.responsibilities.map((r, i) => (
                    <p key={i}>{r}</p>
                  ))}
                </div>
              ))
            )}
          </section>
        </div>

        {shared.source === "server" && (
          <section className="shared-comments">
            <h4 className="h">Comments</h4>
            {shared.comments.length === 0 && <p className="muted">No comments yet.</p>}
            {shared.comments.map((c) => (
              <div className="comment" key={c.id}>
                <div className="comment-h">
                  <b>{c.author}</b>
                  <small>{when(c.created)}</small>
                  {(shared.mine || user?.id === c.userId) && (
                    <button className="link danger" onClick={() => void delComment(c.id)}>
                      Delete
                    </button>
                  )}
                </div>
                <p>{c.text}</p>
              </div>
            ))}
            {user ? (
              <div className="comment-new">
                <textarea
                  value={text}
                  maxLength={1000}
                  rows={3}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Say what works, what worries you, or what you would try"
                  aria-label="New comment"
                />
                <button className="btn primary" disabled={busy || !text.trim()} onClick={() => void send()}>
                  Post comment
                </button>
                {err && <p className="err">{err}</p>}
              </div>
            ) : (
              <p className="muted">
                <button className="link" onClick={() => setAuthOpen(true)}>
                  Sign in
                </button>{" "}
                to comment.
              </p>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
