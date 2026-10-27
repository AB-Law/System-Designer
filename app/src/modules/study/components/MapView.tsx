import { Background, Controls, MiniMap, ReactFlow, type Edge, type Node, type NodeMouseHandler } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { attempt, useAction, type Job } from "../../../shared/async";
import { JobProgress } from "../../../shared/JobProgress";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { studyApi } from "../api";
import { layoutMindMap } from "../layout";
import { go } from "../route";
import type { MapNode, MindMap } from "../types";

export function MapView({ mapId }: { mapId: number }) {
  const [map, setMap] = useState<MindMap | null>(null);
  const [selected, setSelected] = useState<MapNode | null>(null);
  const [chat, setChat] = useState("");
  const [reply, setReply] = useState("");
  const [childLabel, setChildLabel] = useState("");
  const { busy, run } = useAction();

  const load = useCallback(async () => {
    const m = await attempt(() => studyApi.map(mapId));
    if (m) {
      setMap(m);
      setSelected((cur) => (cur ? m.nodes.find((n) => n.id === cur.id) || null : null));
    }
  }, [mapId]);

  useEffect(() => {
    void load();
  }, [load]);

  const { nodes, edges } = useMemo(() => {
    if (!map) return { nodes: [] as Node[], edges: [] as Edge[] };
    const rawNodes: Node[] = map.nodes.map((n) => ({
      id: n.id,
      data: { label: n.label },
      position: { x: 0, y: 0 },
      style: {
        border: selected?.id === n.id ? "2px solid var(--gold-hi)" : "1px solid var(--line)",
        background: "var(--panel)",
        color: "var(--text)",
        borderRadius: 8,
        fontSize: 13,
        padding: "8px 12px",
        minWidth: 120,
      },
    }));
    const rawEdges: Edge[] = map.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      style: { stroke: "var(--gold)" },
    }));
    return { nodes: layoutMindMap(rawNodes, rawEdges), edges: rawEdges };
  }, [map, selected]);

  const onNodeClick: NodeMouseHandler = (_e, node) => {
    setSelected(map?.nodes.find((n) => n.id === node.id) || null);
    setReply("");
  };

  const onJobDone = (_job: Job) => {
    void load();
  };

  const makeDeck = async () => {
    if (!selected) return;
    const deck = await run(() => studyApi.nodeDeck(mapId, selected.id), "Deck created");
    if (deck) go({ name: "deck", deckId: deck.id });
  };

  const addChild = async () => {
    if (!selected || !childLabel.trim()) return;
    const m = await run(() => studyApi.patchNode(mapId, selected.id, { addChildLabel: childLabel.trim() }));
    if (m) {
      setMap(m);
      setChildLabel("");
    }
  };

  const removeNode = async () => {
    if (!selected || !window.confirm(`Delete «${selected.label}» and its children?`)) return;
    const m = await run(() => studyApi.patchNode(mapId, selected.id, { delete: true }));
    if (m) {
      setMap(m);
      setSelected(null);
    }
  };

  const ask = async () => {
    if (!selected || !chat.trim()) return;
    setReply("");
    try {
      await studyApi.nodeChat(mapId, selected.id, chat.trim(), (t) => setReply((r) => r + t));
    } catch (e) {
      setReply(e instanceof Error ? e.message : "Chat failed");
    }
  };

  if (!map) return <p className="st-hint">Loading…</p>;

  return (
    <div className="st-stack">
      <div className="st-row">
        <Button size="small" variant="ghost" onClick={() => go({ name: "maps" })}>
          ← Maps
        </Button>
        <Button
          size="small"
          variant="ghost"
          disabled={busy || map.status === "generating"}
          onClick={() => void run(() => studyApi.regenerateMap(mapId)).then((m) => m && go({ name: "map", mapId: m.id }))}
        >
          Re-generate
        </Button>
      </div>

      {map.status === "generating" && map.jobId ? (
        <JobProgress key={map.jobId} jobId={map.jobId} label="Building mind map" cancellable onDone={onJobDone} />
      ) : (
        <div className="st-map-layout">
          <div className="st-map-canvas">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              fitView
              onNodeClick={onNodeClick}
              nodesDraggable={false}
              proOptions={{ hideAttribution: true }}
            >
              <Background gap={18} color="var(--line-soft)" />
              <Controls />
              <MiniMap pannable zoomable />
            </ReactFlow>
          </div>
          <Card title={selected ? selected.label : "Select a node"} className="st-map-panel">
            {!selected ? (
              <p className="st-hint">Click a concept to see its summary, sources, and actions.</p>
            ) : (
              <div className="st-stack">
                <p>{selected.summary || "No summary."}</p>
                {!!selected.sources.length && (
                  <div>
                    <div className="st-muted">Sources</div>
                    <ul className="st-sources">
                      {selected.sources.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="st-row">
                  <Button size="small" variant="primary" disabled={busy} onClick={() => void makeDeck()}>
                    Make flashcards
                  </Button>
                  <Button size="small" variant="ghost" disabled={busy} onClick={() => void removeNode()}>
                    Delete
                  </Button>
                </div>
                <label className="st-field">
                  <span className="st-muted">Add child</span>
                  <input value={childLabel} onChange={(e) => setChildLabel(e.target.value)} maxLength={120} />
                </label>
                <Button size="small" disabled={busy || !childLabel.trim()} onClick={() => void addChild()}>
                  Add
                </Button>
                <label className="st-field">
                  <span className="st-muted">Ask about this node</span>
                  <textarea value={chat} onChange={(e) => setChat(e.target.value)} maxLength={1000} />
                </label>
                <Button size="small" variant="primary" disabled={!chat.trim()} onClick={() => void ask()}>
                  Ask
                </Button>
                {reply && <p className="st-reply">{reply}</p>}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
