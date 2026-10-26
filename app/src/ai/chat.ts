import { BLOCKS, BLOCK_MAP, clampCfg, money } from "../blocks";
import { analyze, totalCost } from "../sim/analyze";
import { planQueries } from "../sim/data";
import type { Change, ChatMessage, Cfg, Design, EdgeKind, FieldDef, Problem, RunResult } from "../types";
import { dataModelProblems, describeDesign, regionProblems } from "./review";

export type { Change, ChatMessage };

const fieldsOf = (blockId: string): FieldDef[] => (BLOCK_MAP[blockId]?.sections ?? []).flatMap((s) => s.fields);

/** The blocks and settings the coach may use, so its proposals stay inside what the tool supports. */
export const CATALOG = BLOCKS.filter((b) => b.id !== "user")
  .map((b) => {
    const f = fieldsOf(b.id)
      .map(
        (x) =>
          `${x.key}${x.type === "select" ? `[${x.options.join("|")}]` : x.type === "toggle" ? "[true|false]" : x.type === "list" ? "[list of text]" : ""}`,
      )
      .join(", ");
    return `- ${b.id} (${b.label}): ${f}`;
  })
  .join("\n");

export function buildChatMessages(problem: Problem, design: Design, run: RunResult, history: ChatMessage[]) {
  const system =
    "You are a friendly system design coach inside a practice tool. The learner is working on the problem below and is often new to system design. " +
    "Coach, do not hand over answers: ask what they have tried, explain the idea in plain words, and give a hint or the next small step. Give a direct answer or a full fix only when they clearly ask for one. " +
    "Never mention or invent a reference solution. Keep answers short, under 150 words unless asked for more, and avoid jargon without a quick explanation. " +
    "You can see their canvas and the simulator's results, and each block has a 'facts' line computed by the simulator: trust it. " +
    "You cannot change the canvas. If you want to suggest concrete changes, say so in plain words and then end your message with ONE fenced block labelled changes, for example:\n" +
    '```changes\n{"changes":[{"op":"add_block","ref":"c1","blockId":"cache","settings":{"hitRatio":0.9,"replicas":2}},{"op":"connect","from":"s","to":"c1","kind":"sync"},{"op":"set_settings","nodeId":"s","settings":{"replicas":10}}]}\n```\n' +
    `blockId must be exactly one of: ${BLOCKS.filter((b) => b.id !== "user")
      .map((b) => b.id)
      .join(
        ", ",
      )}. It is the kind of block, never a name you make up; ref is the made-up name, for example blockId "load_balancer" with ref "lb_eu". ` +
    "Operations: add_block (ref is a short name you invent so later changes can point at it; capabilities is optional and lists capability ids the block runs), set_settings (nodeId must be an existing block id), connect (from and to are existing block ids or refs; kind is sync, async or both), disconnect (removes the connection from one existing block to another). At most 8 changes. " +
    "To put a cache in front of a database, add the cache, connect the block that reads to the cache, connect the cache to the database, and disconnect the reader from the database. A queue or stream between two blocks works the same way. " +
    "The learner decides whether to apply them, so propose only what you would explain. " +
    (problem.dataModel
      ? "This problem has a data model. On a database, the setting indexes is a list of items written table:column or table:column,column (a column order matters: filter columns first, then the sort column), shardKeys is a list of items written table:column (one per table), and pagination is one of the listed values. Setting a list REPLACES the whole list, so repeat every existing item you want to keep. Only propose data model changes that fix a query problem the simulator found, and never a change that does nothing for the problem you are explaining. "
      : "") +
    (problem.regions
      ? "This problem has users in several regions. A block's region is one of the listed values, and a database's replicaRegions is a list of region names where it keeps a read copy (setting it REPLACES the whole list). A call between regions costs the round trip, so servers and caches belong in the region of their users and writes still go to the database's home region. " +
        "How routing works here: the User block can be connected to SEVERAL load balancers, and users are sent to the one in their own region, or the nearest one that is up; every block does the same with the blocks it calls. So to serve Europe from Europe: add a load balancer, servers (set capabilities to the ids the existing servers run) and a cache, all with region Europe; connect the User block to the new load balancer, the new load balancer to the new servers, the servers to the new cache, and the cache to the existing database; and add Europe to the database's replicaRegions (keeping the ones it has) so cache misses read locally. Keep the original US connections: users elsewhere still use them. Only block types that run in a region have a region setting. "
      : "") +
    "Answer directly. Never think aloud or write 'wait', 'hmm' or 'actually' in your reply: decide first, then explain in a few plain sentences. " +
    "Use only these blocks and settings:\n" +
    CATALOG;

  const caps = problem.capabilities?.length
    ? `Capabilities the design must run (ids in brackets):\n${problem.capabilities.map((c) => `- [${c.id}] ${c.label} (${c.mode === "background" ? "background job" : `${Math.round(c.share * 100)}% of requests, ${c.critical ? "essential" : "optional"}`}): ${c.hint ?? ""}`).join("\n")}`
    : "";
  const results = run.scenarios
    .map(
      (s) =>
        `- ${s.title}: ${s.pass ? "PASS" : "FAIL"}, served ${Math.round(s.served * 100)}%, ${Math.round(s.latencyMs)} ms.${s.pass ? "" : " " + s.reasons.join(" ")}`,
    )
    .join("\n");
  const issues = run.findings
    .filter((f) => f.severity === "bad" || f.severity === "warn")
    .map((f) => `- ${f.title}: ${f.message}`)
    .join("\n");
  const context = [
    `Problem: ${problem.title} (${problem.difficulty})`,
    problem.brief,
    `Constraints:\n${problem.constraints.map((c) => "- " + c).join("\n")}`,
    caps,
    `Scenarios the learner is tested on:\n${problem.scenarios.map((s) => `- ${s.title}: ${s.description}`).join("\n")}`,
    design.nodes.length ? `Their canvas right now:\n${describeDesign(design, problem)}` : "Their canvas is empty.",
    `Cost: ${money(run.cost)} a month${run.budget !== undefined ? ` of a ${money(run.budget)} budget` : ""}.`,
    design.nodes.length ? `Simulator results:\n${results}` : "",
    issues ? `Problems the simulator found:\n${issues}` : "",
    (() => {
      const measured = design.nodes.length ? [...dataModelProblems(design, problem), ...regionProblems(design, problem, run)] : [];
      return measured.length
        ? `Measured problems with the data model or the regions. If you propose a change, it must fix one of these:\n${measured.map((m) => "- " + m).join("\n")}`
        : "";
    })(),
  ]
    .filter(Boolean)
    .join("\n\n");

  return [{ role: "system", content: system + "\n\n" + context }, ...history.slice(-12).map((m) => ({ role: m.role, content: m.content }))];
}

/** Keep only what is real and in range: unknown blocks, settings and ids are dropped, values are coerced. */
function cleanSettings(blockId: string, input: unknown): Cfg {
  const out: Cfg = {};
  if (!input || typeof input !== "object") return out;
  const fields = new Map(fieldsOf(blockId).map((f) => [f.key, f]));
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    const f = fields.get(k);
    if (!f) continue;
    if (f.type === "number" || f.type === "ratio") {
      const x = Number(v);
      if (!Number.isFinite(x)) continue;
      const lo = f.type === "ratio" ? 0 : (f.min ?? -Infinity);
      const hi = f.type === "ratio" ? (f.max ?? 1) : (f.max ?? Infinity);
      out[k] = Math.min(hi, Math.max(lo, x));
    } else if (f.type === "toggle") out[k] = v === true || v === "true";
    else if (f.type === "select") {
      if (typeof v === "string" && f.options.includes(v)) out[k] = v;
    } else if (f.type === "list" && Array.isArray(v)) out[k] = v.map(String).slice(0, 8);
  }
  return out;
}

/** Check a list of proposed changes against the real blocks, settings and ids. `dropped` counts the ones that could not be kept. */
export function sanitizeChanges(rawList: unknown[], problem: Problem, design: Design): { changes: Change[]; dropped: number } {
  const list: any[] = rawList.slice(0, 8);
  const capIds = new Set((problem.capabilities ?? []).map((c) => c.id));
  const existing = new Set(design.nodes.map((n) => n.id));
  const refs = new Set<string>();
  const out: Change[] = [];
  const caps = (v: unknown) => (Array.isArray(v) ? v.map(String).filter((id) => capIds.has(id)) : undefined);
  // a connection may come before the block it mentions in the model's list, so learn every new block's name first
  for (const c of list) {
    const r = c?.op === "add_block" && BLOCK_MAP[String(c.blockId)] && c.blockId !== "user" ? String(c.ref || "").slice(0, 20) : "";
    if (r) refs.add(r);
  }
  let dropped = 0;
  for (const c of list) {
    if (!c || typeof c !== "object") {
      dropped++;
      continue;
    }
    if (c.op === "add_block") {
      const def = BLOCK_MAP[String(c.blockId)];
      if (!def || def.id === "user") {
        dropped++;
        continue;
      }
      const ref = String(c.ref || `new${out.length + 1}`).slice(0, 20);
      out.push({ op: "add_block", ref, blockId: def.id, settings: cleanSettings(def.id, c.settings), capabilities: caps(c.capabilities) });
      refs.add(ref);
    } else if (c.op === "set_settings") {
      const node = design.nodes.find((n) => n.id === c.nodeId);
      if (!node) {
        dropped++;
        continue;
      }
      const settings = cleanSettings(node.blockId, c.settings);
      const capabilities = caps(c.capabilities);
      // a setting that is not real is ignored; if nothing real is left, the change does nothing, which is harmless
      if (!Object.keys(settings).length && !capabilities) continue;
      out.push({ op: "set_settings", nodeId: node.id, settings, capabilities });
    } else if (c.op === "connect") {
      const ok = (id: string) => existing.has(id) || refs.has(id);
      if (!ok(String(c.from)) || !ok(String(c.to)) || c.from === c.to) {
        dropped++;
        continue;
      }
      const kind: EdgeKind = c.kind === "async" || c.kind === "both" ? c.kind : "sync";
      out.push({ op: "connect", from: String(c.from), to: String(c.to), kind });
    } else if (c.op === "disconnect") {
      const from = String(c.from);
      const to = String(c.to);
      if (!design.edges.some((e) => e.source === from && e.target === to)) {
        dropped++;
        continue;
      }
      out.push({ op: "disconnect", from, to });
    } else dropped++;
  }
  return { changes: out, dropped };
}

/** Split the model's reply into what to show and the changes it proposed. */
export function parseChanges(reply: string, problem: Problem, design: Design): { text: string; changes: Change[] } {
  const clean = reply.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  const m = clean.match(/```changes\s*([\s\S]*?)```/);
  const text = clean.replace(/```changes[\s\S]*?```/g, "").trim();
  if (!m) return { text, changes: [] };
  let raw: any;
  try {
    raw = JSON.parse(m[1]);
  } catch {
    return { text, changes: [] };
  }
  const { changes: out, dropped } = sanitizeChanges(Array.isArray(raw?.changes) ? raw.changes : [], problem, design);
  // all or nothing: a proposal with a part that cannot be applied may be incoherent (a connection removed and its replacement lost)
  if (dropped > 0)
    return {
      text: `${text}

(The coach wrote a change that could not be applied safely, so none of its changes are offered. Ask it to try again, or say exactly what you want changed.)`,
      changes: [],
    };
  return { text, changes: out };
}

/**
 * What a change to the settings of one existing block would do, worked out by the simulator before the learner is asked: how each
 * query of the data model would run, how many scenarios would pass, and what it would cost. A proposal that makes things worse says so.
 */
function effectOf(c: Extract<Change, { op: "set_settings" }>, design: Design, problem: Problem): string {
  const node = design.nodes.find((n) => n.id === c.nodeId);
  const def = node && BLOCK_MAP[node.blockId];
  if (!node || !def) return "";
  try {
    const after: Design = {
      ...design,
      nodes: design.nodes.map((n) =>
        n.id === node.id ? { ...n, cfg: clampCfg(def, { ...n.cfg, ...c.settings }), capabilities: c.capabilities ?? n.capabilities } : n,
      ),
    };
    const parts: string[] = [];
    const qs: string[] = [];
    if (problem.dataModel && node.blockId === "database") {
      const x = (f: number) => (f <= 1.05 ? "ideal" : f >= 10 ? `${Math.round(f)}x` : `${f.toFixed(1)}x`);
      const was = planQueries(problem, node.cfg, problem.capabilities ?? []);
      const now = planQueries(problem, after.nodes.find((n) => n.id === node.id)!.cfg, problem.capabilities ?? []);
      for (const q of now.queries) {
        const b = was.queries.find((y) => y.id === q.id);
        if (b && Math.abs(q.factor - b.factor) / Math.max(1e-9, b.factor) >= 0.05)
          qs.push(`"${q.label}" ${x(b.factor)} to ${x(q.factor)}${q.factor > b.factor * 1.5 ? " (worse)" : ""}`);
      }
      if (qs.length) parts.push(`the work each query needs (ideal is as cheap as it gets): ${qs.join("; ")}`);
      else parts.push("it changes nothing for the queries");
    }
    const a = analyze(design, problem);
    const b = analyze(after, problem);
    const pa = a.scenarios.filter((s) => s.pass).length;
    const pb = b.scenarios.filter((s) => s.pass).length;
    if (pa !== pb) parts.push(`scenarios passing ${pa} of ${a.scenarios.length} to ${pb} of ${b.scenarios.length}`);
    const ca = totalCost(design, problem);
    const cb = totalCost(after, problem);
    if (Math.abs(cb - ca) >= 25) parts.push(`monthly cost ${money(ca)} to ${money(cb)}`);
    return parts.length ? ` Simulated effect: ${parts.join("; ")}.` : "";
  } catch {
    return "";
  }
}

/** One plain-language line per change, so the learner can see exactly what approving would do. */
export function describeChange(c: Change, design: Design, changes: Change[], problem?: Problem): string {
  const nameOf = (id: string) => {
    const added = changes.find((x) => x.op === "add_block" && x.ref === id) as Extract<Change, { op: "add_block" }> | undefined;
    if (added) return `new ${BLOCK_MAP[added.blockId]?.label ?? added.blockId}`;
    const n = design.nodes.find((x) => x.id === id);
    return n ? (BLOCK_MAP[n.blockId]?.label ?? n.blockId) : id;
  };
  const show = (blockId: string, settings: Cfg, before?: Cfg) => {
    const labels = new Map(fieldsOf(blockId).map((f) => [f.key, f.label]));
    // an index is "table:col,col" and a shard key "table:col"; written out so the commas inside one cannot be mistaken for a list
    const one = (k: string, x: unknown): string => {
      const t = String(x);
      if (k === "indexes") return t.replace(/^([^:]+):(.*)$/, (_, tb: string, cols: string) => `${tb} (${cols.split(",").join(", ")})`);
      if (k === "shardKeys") return t.replace(/^([^:]+):(.*)$/, "$1 by $2");
      return t;
    };
    const fmt = (k: string, v: unknown): string =>
      Array.isArray(v)
        ? v.length
          ? v.map((x) => one(k, x)).join(k === "indexes" || k === "shardKeys" ? "; " : ", ")
          : "none"
        : typeof v === "boolean"
          ? v
            ? "on"
            : "off"
          : String(v);
    const dropped = (k: string, v: unknown): string => {
      const was: unknown[] = before && Array.isArray(before[k]) ? before[k] : [];
      const gone = Array.isArray(v) ? was.filter((x) => !(v as unknown[]).includes(x)) : [];
      return gone.length ? ` (removes ${gone.map((x) => one(k, x)).join("; ")})` : "";
    };
    return Object.entries(settings)
      .map(
        ([k, v]) =>
          `${labels.get(k) ?? k}: ${before && before[k] !== undefined ? `${fmt(k, before[k])} to ` : ""}${fmt(k, v)}${dropped(k, v)}`,
      )
      .join("; ");
  };
  if (c.op === "add_block") {
    const caps = (c.capabilities ?? []).length ? ` running ${(c.capabilities ?? []).join(", ")}` : "";
    const s = show(c.blockId, c.settings);
    return `Add a ${BLOCK_MAP[c.blockId]?.label ?? c.blockId}${caps}${s ? ` (${s})` : ""}`;
  }
  if (c.op === "set_settings") {
    const node = design.nodes.find((n) => n.id === c.nodeId)!;
    const s = show(node.blockId, c.settings, node.cfg);
    return `Change ${nameOf(c.nodeId)}${s ? `: ${s}` : ""}${c.capabilities ? `; now runs ${c.capabilities.join(", ") || "nothing"}` : ""}${problem ? effectOf(c, design, problem) : ""}`;
  }
  if (c.op === "disconnect") return `Remove the connection from ${nameOf(c.from)} to ${nameOf(c.to)}`;
  return `Connect ${nameOf(c.from)} to ${nameOf(c.to)} (${c.kind === "sync" ? "a normal call" : c.kind === "async" ? "asynchronous" : "two-way"})`;
}
