import { useCallback, useEffect, useState } from "react";
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useViewport,
  type NodeProps,
} from "@xyflow/react";
import { BLOCK_MAP, modelOf } from "../../blocks";
import { useRun } from "../../hooks";
import { useProblem, useStore, type RFNode } from "../../store";
import { capIdsOf } from "../../sim/caps";
import { isPlaceable, regionId, regionShort } from "../../sim/regions";
import { placeBlock, replicaKey, useNotice } from "../../store/place";
import { ChatDock } from "./ChatDock";
import { FlowEdge, LiveLayer, useLive } from "./live";
import type { EdgeKind } from "../../types";

/** What the load badge means, in words. Far over capacity usually means each request costs the block much more than it should. */
function loadTitle(u: number, database: boolean): string {
  const base = `Receiving ${u >= 10 ? "more than 10 times" : `${Math.round(u * 100)}% of`} what this block can handle.`;
  if (u < 1) return base;
  return `${base} Above 100% it cannot keep up, so requests wait or fail.${database ? " For a database, a missing index is a common cause: each request then reads far more rows than it needs." : ""}`;
}

/** What the player should know about the block they just added: over budget, or an identical block already there. */
function PlaceNoticeBar() {
  const notice = useNotice((s) => s.notice);
  const clear = useNotice((s) => s.clear);
  if (!notice) return null;
  return (
    <div className={"place-notice " + notice.tone} role="status">
      <span>{notice.text}</span>
      {notice.action && (
        <button type="button" className="btn small primary" onClick={notice.action.run}>
          {notice.action.label}
        </button>
      )}
      <button type="button" className="btn small ghost" onClick={clear} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}

function BlockNode({ id, data, selected }: NodeProps<RFNode>) {
  const def = BLOCK_MAP[data.blockId];
  const run = useRun();
  const simScenario = useStore((s) => s.simScenario);
  const problem = useProblem();
  const capNames = capIdsOf(data.blockId, data.capabilities, problem)
    .map((cid) => problem?.capabilities?.find((c) => c.id === cid)?.label)
    .filter((x): x is string => !!x);
  const live = useLive();
  const vis = live.on ? live.nodes[id] : undefined;
  const res = run?.scenarios.find((s) => s.scenarioId === simScenario)?.nodes[id];
  const u = res && res.incoming > 0 ? res.utilization : undefined;
  const copies = replicaKey(data.blockId)
    ? Math.max(1, Math.round(Number(data.cfg[replicaKey(data.blockId)!] ?? modelOf(data.blockId, data.cfg).instances ?? 1)))
    : 1;
  const status = res?.down ? "down" : u === undefined ? "" : u >= 1 ? "hot" : u >= 0.8 ? "warm" : "ok";
  return (
    <div className={`bnode cat-${def.category} ${selected ? "sel" : ""} ${vis ? "live live-" + vis.state : status}`}>
      {([Position.Top, Position.Right, Position.Bottom, Position.Left] as const).map((p) => (
        <Handle key={p} id={p} type="source" position={p} />
      ))}
      {problem?.regions && isPlaceable(data.blockId) && (
        <div className={"bn-region r-" + regionId(data.cfg.region, regionId(problem.regions.home))} title="The region this block runs in">
          {regionShort(regionId(data.cfg.region, regionId(problem.regions.home)))}
        </div>
      )}
      <div className="bn-label">{def.label}</div>
      {capNames.length > 0 && (
        <div className="bn-resp" title={capNames.join(", ")}>
          {capNames[0]}
          {capNames.length > 1 && ` +${capNames.length - 1}`}
        </div>
      )}
      {capNames.length === 0 && data.responsibilities[0] && <div className="bn-resp">{data.responsibilities[0]}</div>}
      {vis ? (
        vis.label && (
          <div className="bn-util bn-live" title={vis.label}>
            <span aria-hidden="true">{vis.icon}</span> {vis.label}
            {vis.queue ? ` · ${Math.round(vis.queue).toLocaleString()} queued` : ""}
          </div>
        )
      ) : res?.down ? (
        <div className="bn-util">down</div>
      ) : u !== undefined && data.blockId !== "user" ? (
        <div className="bn-util" title={loadTitle(u, data.blockId === "database" && !!problem?.dataModel)}>
          {u >= 1.5 ? "Overloaded" : `${Math.round(u * 100)}%`}
        </div>
      ) : null}
      {copies > 1 && data.blockId !== "user" && (
        <div
          className={"bn-copies" + (vis?.state === "down" || vis?.state === "degraded" ? " lost" : "")}
          title={`${copies} copies of this block run side by side, each handling a share of the traffic.`}
        >
          {vis?.state === "degraded" ? `×${copies - 1}/${copies}` : `×${copies}`}
        </div>
      )}
    </div>
  );
}

const nodeTypes = { block: BlockNode };
const edgeTypes = { default: FlowEdge };

const EDGE_BUTTONS: { kind: EdgeKind; label: string; title: string }[] = [
  { kind: "sync", label: "→", title: "Synchronous call" },
  { kind: "async", label: "⇢", title: "Asynchronous (queue / fire-and-forget)" },
  { kind: "both", label: "↔", title: "Two-way" },
];

function Inner() {
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const onNodesChange = useStore((s) => s.onNodesChange);
  const onEdgesChange = useStore((s) => s.onEdgesChange);
  const connect = useStore((s) => s.connect);
  const select = useStore((s) => s.select);
  const beginDrag = useStore((s) => s.beginDrag);
  const edgeMode = useStore((s) => s.edgeMode);
  const selectedEdgeId = useStore((s) => s.selectedEdgeId);
  const setEdgeKind = useStore((s) => s.setEdgeKind);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const clearAll = useStore((s) => s.clearAll);
  const autoLayout = useStore((s) => s.autoLayout);
  const setShareOpen = useStore((s) => s.setShareOpen);
  const problem = useProblem();
  const { screenToFlowPosition, zoomIn, zoomOut, fitView } = useReactFlow();
  const { zoom } = useViewport();
  const fitTick = useStore((s) => s.fitTick);
  useEffect(() => {
    // minZoom keeps block labels readable when a problem opens; the toolbar fit button still shows everything
    if (fitTick > 0) setTimeout(() => fitView({ padding: 0.25, minZoom: 0.6, maxZoom: 1, duration: 250 }), 80);
  }, [fitTick, fitView]);
  // Touch screens cannot hover or hit a 9px dot, so linking can also be done by tapping two blocks in turn.
  const [linking, setLinking] = useState(false);
  const [linkFrom, setLinkFrom] = useState<string | null>(null);
  const stopLinking = () => {
    setLinking(false);
    setLinkFrom(null);
  };
  const onNodeTap = (id: string) => {
    useStore.setState({ selectedEdgeId: undefined });
    if (!linking) return;
    if (!linkFrom) {
      setLinkFrom(id);
      return;
    }
    if (id !== linkFrom) {
      connect({ source: linkFrom, target: id, sourceHandle: Position.Right, targetHandle: Position.Left });
      stopLinking();
    }
  };
  const selectedKind = edges.find((e) => e.id === selectedEdgeId)?.data?.kind ?? edgeMode;

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const id = e.dataTransfer.getData("application/x-block");
      if (!id || !BLOCK_MAP[id]) return;
      const p = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      placeBlock(id, { x: p.x - 45, y: p.y - 20 });
    },
    [screenToFlowPosition],
  );

  return (
    <div className={"canvas" + (linking ? " linking" : "")} data-tour="canvas" onDrop={onDrop} onDragOver={(e) => e.preventDefault()}>
      <PlaceNoticeBar />
      <LiveLayer>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={connect}
          onNodeDragStart={beginDrag}
          onNodeClick={(_, n) => onNodeTap(n.id)}
          onEdgeClick={(_, e) => select(undefined, e.id)}
          multiSelectionKeyCode={["Control", "Meta"]}
          selectionKeyCode="Shift"
          onPaneClick={() => select()}
          connectionMode={ConnectionMode.Loose}
          deleteKeyCode={["Backspace", "Delete"]}
          snapToGrid
          snapGrid={[10, 10]}
          fitView
          fitViewOptions={{ minZoom: 0.6, maxZoom: 1, padding: 0.25 }}
          minZoom={0.3}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} />
          <MiniMap
            pannable
            zoomable
            className="minimap"
            style={{ width: 150, height: 96 }}
            nodeColor={(n) => BLOCK_MAP[(n.data as { blockId: string }).blockId]?.color ?? "#888"}
          />
        </ReactFlow>
      </LiveLayer>
      <div className="toolbar">
        <button title="Undo (Ctrl+Z)" onClick={undo}>
          ↶
        </button>
        <button title="Redo (Ctrl+Shift+Z)" onClick={redo}>
          ↷
        </button>
        <i />
        <button onClick={() => zoomOut()}>−</button>
        <span className="zoom">{Math.round(zoom * 100)}%</span>
        <button onClick={() => zoomIn()}>+</button>
        <button title="Fit to screen" onClick={() => fitView({ padding: 0.25, maxZoom: 1 })}>
          ⛶
        </button>
        <button
          title="Tidy: arrange the blocks left to right along their connections"
          onClick={() => {
            autoLayout();
            setTimeout(() => fitView({ padding: 0.25, maxZoom: 1, duration: 250 }), 60);
          }}
        >
          ⊞
        </button>
        <button title="Share or export this design" onClick={() => setShareOpen(true)}>
          ⇪
        </button>
        <i />
        {EDGE_BUTTONS.map((b) => (
          <button
            key={b.kind}
            title={selectedEdgeId ? `Set selected connection: ${b.title}` : `New connections: ${b.title}`}
            className={selectedKind === b.kind ? "active" : ""}
            onClick={() => setEdgeKind(b.kind)}
          >
            {b.label}
          </button>
        ))}
        <i />
        <button
          title="Connect two blocks by tapping them one after the other"
          className={"link-btn" + (linking ? " active" : "")}
          aria-pressed={linking}
          onClick={() => (linking ? stopLinking() : setLinking(true))}
        >
          Link
        </button>
        <i />
        <button title="Clear canvas" onClick={() => nodes.length && confirm("Clear the whole canvas?") && clearAll()}>
          🗑
        </button>
      </div>
      {linking && (
        <div className="link-hint" role="status">
          {linkFrom ? "Now tap the block it should connect to." : "Tap the block the connection starts from."}
          <button type="button" onClick={stopLinking}>
            Done
          </button>
        </div>
      )}
      <ChatDock />
      {nodes.length === 0 && (
        <div className="empty">
          <div>
            <b>Start here</b>
            <ol>
              <li>Drag a User block from the left onto the canvas. It is where the traffic comes from.</li>
              <li>Add blocks that handle it, such as an API Gateway and a Database.</li>
              <li>Drag from a dot on one block to a dot on the next to connect them, or on a phone press Link and tap two blocks.</li>
              <li>Press Simulate to watch the traffic, then Preview score.</li>
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}

export function CanvasView() {
  return (
    <ReactFlowProvider>
      <Inner />
    </ReactFlowProvider>
  );
}
