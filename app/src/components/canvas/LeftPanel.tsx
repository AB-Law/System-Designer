import { useState } from "react";
import { BLOCKS, BLOCK_MAP, CATEGORIES, blockCost, modelOf, money } from "../../blocks";
import { useProblem } from "../../store";
import { HOST_BLOCKS, capIdsOf, workFactor } from "../../sim/caps";
import { DataModelEditor } from "./DataModelEditor";
import { RegionEditor } from "./RegionEditor";
import { WhyPanel } from "./WhyPanel";
import { useStore } from "../../store";
import { useMode } from "../../store/mode";
import type { FieldDef, SectionDef } from "../../types";

export function LeftPanel() {
  const count = useStore((s) => s.nodes.filter((n) => n.selected).length);
  const firstId = useStore((s) => s.nodes.find((n) => n.selected)?.id);
  return (
    <aside className="left">
      {count > 1 ? <MultiSelect count={count} /> : count === 1 && firstId ? <Settings key={firstId} nodeId={firstId} /> : <Palette />}
    </aside>
  );
}

function MultiSelect({ count }: { count: number }) {
  const select = useStore((s) => s.select);
  const copy = useStore((s) => s.copySelection);
  const dup = useStore((s) => s.duplicate);
  const del = useStore((s) => s.deleteSelected);
  return (
    <>
      <div className="panel-title">Selection</div>
      <div className="scroll">
        <div className="set-head">
          <button className="btn small ghost" onClick={() => select()}>
            ‹ All blocks
          </button>
        </div>
        <h3 className="set-title">{count} blocks</h3>
        <p className="muted">Settings are edited one block at a time. Click a single block to change it.</p>
        <div className="multi-actions">
          <button className="btn" onClick={dup}>
            Duplicate <kbd>Ctrl D</kbd>
          </button>
          <button className="btn" onClick={copy}>
            Copy <kbd>Ctrl C</kbd>
          </button>
          <button className="btn danger" onClick={del}>
            Delete <kbd>Del</kbd>
          </button>
        </div>
        <p className="foot-note">Paste with Ctrl V. Connections between the selected blocks are copied too.</p>
      </div>
    </>
  );
}

function Palette() {
  const [q, setQ] = useState("");
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const addNode = useStore((s) => s.addNode);
  const mode = useMode((s) => s.mode);
  const setMode = useMode((s) => s.setMode);
  const query = q.trim().toLowerCase();

  return (
    <>
      <div className="panel-title">Building Blocks</div>
      <div className="mode-switch" role="group" aria-label="What happens when you add a block">
        {(["build", "configure"] as const).map((m) => (
          <button
            key={m}
            className={mode === m ? "active" : ""}
            aria-pressed={mode === m}
            onClick={() => setMode(m)}
            title={m === "build" ? "Added blocks stay unselected, so you can keep placing blocks" : "Added blocks open their settings"}
          >
            {m === "build" ? "Build" : "Configure"}
          </button>
        ))}
      </div>
      <input className="search" placeholder="Search blocks" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="scroll">
        {CATEGORIES.map((cat) => {
          const items = BLOCKS.filter((b) => b.category === cat.id && (!query || (b.label + b.summary).toLowerCase().includes(query)));
          if (!items.length) return null;
          const isClosed = closed[cat.id] && !query;
          return (
            <section key={cat.id}>
              <button className="cat" onClick={() => setClosed({ ...closed, [cat.id]: !closed[cat.id] })}>
                <span>{isClosed ? "›" : "⌄"}</span> {cat.label}
                <span className="count">{items.length}</span>
              </button>
              {!isClosed &&
                items.map((b) => (
                  <div
                    key={b.id}
                    className="block-item"
                    data-tour={`palette-${b.id}`}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("application/x-block", b.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDoubleClick={() => addNode(b.id)}
                    title="Drag onto the canvas (or double-click to add)"
                  >
                    <span className={`chip cat-${b.category}`}>{b.icon}</span>
                    <span>
                      <div className="bi-name">{b.label}</div>
                      <div className="bi-sum">{b.summary}</div>
                    </span>
                  </div>
                ))}
            </section>
          );
        })}
      </div>
      <div className="hint">
        Drag a block onto the canvas. Build keeps this list open; Configure opens each new block's settings. Click one to edit it;
        Ctrl+click or Shift+drag to select several.
      </div>
    </>
  );
}

function Settings({ nodeId }: { nodeId: string }) {
  const node = useStore((s) => s.nodes.find((n) => n.id === nodeId))!;
  const select = useStore((s) => s.select);
  const setCfg = useStore((s) => s.setCfg);
  const setResp = useStore((s) => s.setResponsibilities);
  const del = useStore((s) => s.deleteNode);
  const def = BLOCK_MAP[node.data.blockId];
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [shut, setShut] = useState<Record<string, boolean>>({});
  const problem = useProblem();
  const cost = blockCost(node.data.blockId, node.data.cfg, problem?.traffic.writeShare, problem);
  const m0 = modelOf(node.data.blockId, node.data.cfg, problem?.traffic.writeShare);
  const stores = m0.readCapacity !== undefined && m0.writeCapacity !== undefined ? m0 : undefined;

  const commitResp = () => {
    const v = draft.trim();
    if (v) setResp(nodeId, [...node.data.responsibilities, v]);
    setDraft("");
    setAdding(false);
  };

  return (
    <>
      <div className="panel-title">Block Settings</div>
      <div className="scroll">
        <div className="set-head">
          <button className="btn small ghost" onClick={() => select()}>
            ‹ All blocks
          </button>
          <span className="tag">
            <i className={`cat-${def.category}`} /> {def.label}
          </span>
        </div>
        <h3 className="set-title">{def.label}</h3>
        <WhyPanel nodeId={nodeId} />
        <div className="resp">
          {node.data.responsibilities.map((r, i) => (
            <div className="resp-chip" key={i}>
              <span>{r}</span>
              <button
                aria-label="Remove this note"
                onClick={() =>
                  setResp(
                    nodeId,
                    node.data.responsibilities.filter((_, j) => j !== i),
                  )
                }
              >
                ×
              </button>
            </div>
          ))}
          {adding ? (
            <textarea
              autoFocus
              className="resp-input"
              rows={3}
              placeholder="What does this block do, and why is it set up this way? The coach and the reviewer read it."
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitResp}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  commitResp();
                }
                if (e.key === "Escape") {
                  setDraft("");
                  setAdding(false);
                }
              }}
            />
          ) : (
            <button
              className="link"
              onClick={() => setAdding(true)}
              title="Explain what this block does and why. Shown to the AI reviewer and the coach."
            >
              + Add a note
            </button>
          )}
        </div>

        {problem?.capabilities?.length && HOST_BLOCKS.has(node.data.blockId) ? <Hosts nodeId={nodeId} /> : null}

        {def.sections.map((sec) =>
          sec.id === "datamodel" ? (
            problem?.dataModel ? (
              <DataModelEditor key={sec.id} nodeId={nodeId} />
            ) : null
          ) : sec.id === "placement" ? (
            problem?.regions ? (
              <RegionEditor key={sec.id} nodeId={nodeId} />
            ) : null
          ) : (
            <Section
              key={sec.id}
              sec={sec}
              closed={shut[sec.id] ?? !!sec.collapsed}
              toggle={() => setShut({ ...shut, [sec.id]: !(shut[sec.id] ?? !!sec.collapsed) })}
            >
              {sec.fields
                .filter((f) => !f.hidden)
                .map((f) => (
                  <Field key={f.key} f={f} cfg={node.data.cfg} onChange={(v) => setCfg(nodeId, f.key, v)} />
                ))}
            </Section>
          ),
        )}
        <div className="cost-line">
          <span>Estimated cost of this block</span>
          <b>
            {money(cost)}
            <small> / mo</small>
          </b>
        </div>
        {stores && (
          <p className="foot-note">
            On its own this block takes about <b>{Math.round(stores.readCapacity!).toLocaleString()}</b> reads/s, or{" "}
            <b>{Math.round(stores.writeCapacity!).toLocaleString()}</b> writes/s.{" "}
            {node.data.blockId === "geo_index"
              ? "Copies add query capacity, but every copy applies every update."
              : "Read replicas add reads only: writes go to the primary of each shard. Shards add both."}
          </p>
        )}
        <p className="foot-note">Only settings the simulator uses are shown. Each setting has a realistic maximum.</p>
        <button className="btn danger block" onClick={() => del(nodeId)}>
          Delete component
        </button>
      </div>
    </>
  );
}

function Hosts({ nodeId }: { nodeId: string }) {
  const problem = useProblem()!;
  const node = useStore((s) => s.nodes.find((n) => n.id === nodeId))!;
  const toggle = useStore((s) => s.toggleCapability);
  const caps = problem.capabilities ?? [];
  const picked = capIdsOf(node.data.blockId, node.data.capabilities, problem);
  const mine = caps.filter((c) => picked.includes(c.id));
  const work = workFactor(mine);
  const requestMine = mine.filter((c) => c.mode !== "background");
  return (
    <div className="sec hosts">
      <div className="sec-h static">What this block runs</div>
      {caps.map((c) => (
        <label className="host-row" key={c.id}>
          <input type="checkbox" checked={picked.includes(c.id)} onChange={() => toggle(nodeId, c.id)} />
          <span>
            <b>{c.label}</b>
            {c.hint && <small>{c.hint}</small>}
          </span>
          <em>{c.mode === "background" ? "background" : `${Math.round(c.share * 100)}% of requests`}</em>
        </label>
      ))}
      <div className="muted host-note">
        {mine.length === 0
          ? "Runs nothing yet. Tick what this block should do."
          : requestMine.length > 1
            ? `Runs ${requestMine.length} things in one process: ${work.toFixed(2)}x work per request, and they fail together.`
            : `Work per request: ${work.toFixed(2)}x.`}
      </div>
    </div>
  );
}

function Section({ sec, closed, toggle, children }: { sec: SectionDef; closed: boolean; toggle: () => void; children: React.ReactNode }) {
  if (sec.fields.length === 0 && sec.id === "security") {
    return (
      <div className="sec">
        <button className="sec-h" onClick={toggle}>
          <span>{closed ? "›" : "⌄"}</span> {sec.title}
        </button>
        {!closed && <div className="muted">No simulated settings.</div>}
      </div>
    );
  }
  return (
    <div className="sec">
      <button className="sec-h" onClick={toggle}>
        <span>{closed ? "›" : "⌄"}</span> {sec.title}
      </button>
      {!closed && <div className="sec-body">{children}</div>}
    </div>
  );
}

function Field({ f, cfg, onChange }: { f: FieldDef; cfg: Record<string, any>; onChange: (v: unknown) => void }) {
  if (f.showIf && cfg[f.showIf.key] !== f.showIf.equals) return null;
  const v = cfg[f.key] ?? f.default;

  if (f.type === "toggle")
    return (
      <div className="row" data-field={f.key}>
        <label>{f.label}</label>
        <button role="switch" aria-checked={!!v} className={"switch" + (v ? " on" : "")} onClick={() => onChange(!v)} />
      </div>
    );
  if (f.type === "select")
    return (
      <div className="col" data-field={f.key}>
        <label>{f.label}</label>
        <select value={v} onChange={(e) => onChange(e.target.value)}>
          {f.options.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      </div>
    );
  if (f.type === "list") {
    const items: string[] = Array.isArray(v) ? v : [];
    const shown = items.length ? items : [];
    return (
      <div className="col" data-field={f.key}>
        <label>{f.label}</label>
        {shown.map((it, i) => (
          <div className="list-row" key={i}>
            <input value={it} placeholder={f.placeholder} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} />
            <button aria-label="Remove" onClick={() => onChange(items.filter((_, j) => j !== i))}>
              ×
            </button>
          </div>
        ))}
        <button className="link" onClick={() => onChange([...items, ""])}>
          + {f.addLabel ?? "Add"}
        </button>
      </div>
    );
  }
  const isRatio = f.type === "ratio";
  const min = isRatio ? 0 : f.min;
  const max = isRatio ? (f.max ?? 1) : f.max;
  const step = isRatio ? 0.01 : (f.step ?? 1);
  return (
    <div className="row" data-field={f.key}>
      <label>{f.label}</label>
      <div className="num">
        <input
          type="number"
          value={Number.isFinite(v) ? v : ""}
          min={min}
          max={max}
          step={step}
          title={max !== undefined ? `Allowed: ${min ?? 0} to ${max}` : undefined}
          onChange={(e) => {
            if (e.target.value === "") return onChange(min ?? 0);
            let x = parseFloat(e.target.value);
            if (min !== undefined) x = Math.max(min, x);
            if (max !== undefined) x = Math.min(max, x);
            onChange(x);
          }}
        />
        {!isRatio && f.unit && <span className="unit">{f.unit}</span>}
      </div>
    </div>
  );
}
