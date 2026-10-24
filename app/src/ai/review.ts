import { BLOCK_MAP, blockCost, modelOf, money } from "../blocks";
import { cloudOn, getToken, lsGet, lsSet } from "../api";
import type { AiReview, AiSettings, Design, Failure, Problem, RunResult, Scenario } from "../types";
import { GUARANTEE_LABEL, capIdsOf, hostedCaps, unmetGuarantees } from "../sim/caps";
import { indexText, planQueries } from "../sim/data";
import { REGIONS, copyRegions, isPlaceable, regionId, regionLabel } from "../sim/regions";
import { DEFAULT_OPENAI_MODEL, OPENAI_BASE, buildCompletionsBody } from "./openai";

export type { AiSettings };
export { DEFAULT_OPENAI_MODEL, OPENAI_BASE };

const KEY = "dc:ai";
export const DEFAULT_AI: AiSettings = { provider: "off", baseUrl: "http://localhost:1234/v1", apiKey: "", model: "", thinking: "off" };

/** API key stays in memory only so a stolen localStorage dump cannot reuse it. */
let memoryApiKey = "";

export const loadAiSettings = (): AiSettings => {
  const saved = lsGet<Partial<AiSettings>>(KEY, {});
  // strip any key that an older build may have written to disk
  if (saved.apiKey) {
    memoryApiKey = saved.apiKey;
    const { apiKey: _drop, ...rest } = saved;
    lsSet(KEY, rest);
  }
  return { ...DEFAULT_AI, ...saved, apiKey: memoryApiKey };
};
export const saveAiSettings = (s: AiSettings) => {
  memoryApiKey = s.apiKey;
  const { apiKey: _drop, ...rest } = s;
  lsSet(KEY, rest);
};

export function presetFor(provider: AiSettings["provider"], prev: AiSettings): AiSettings {
  if (provider === "lmstudio") return { ...prev, provider, baseUrl: "http://localhost:1234/v1", apiKey: "" };
  if (provider === "openai") return { ...prev, provider, baseUrl: OPENAI_BASE, model: prev.model || DEFAULT_OPENAI_MODEL };
  return { ...prev, provider };
}

/** What is wrong with the data model of each database in the design, as the simulator sees it. Empty when every query is as cheap as it can be. */
export function dataModelProblems(design: Design, problem: Problem): string[] {
  if (!problem.dataModel) return [];
  const out: string[] = [];
  for (const db of design.nodes.filter((n) => n.blockId === "database")) {
    const dp = planQueries(problem, db.cfg, problem.capabilities ?? []);
    for (const q of dp.queries) {
      if (q.op === "read" && q.factor >= 1.5)
        out.push(
          `The query "${q.label}" on ${db.id}: ${q.plan} (${q.factor >= 10 ? Math.round(q.factor) : q.factor.toFixed(1)}x the work it needs${q.why.length ? `; ${q.why.join("; ")}` : ""}).`,
        );
      if (q.op === "write" && q.factor > 1.3)
        out.push(`The write "${q.label}" on ${db.id}: ${q.why[0] ?? q.plan} (${q.factor.toFixed(1)}x the work it needs).`);
    }
    if (dp.skew < 0.7)
      out.push(`The shard key on ${db.id} leaves only about ${Math.round(dp.skew * 100)}% of the shards' capacity usable.`);
  }
  return out;
}

/** Where the simulator found trouble with regions: users who wait too long, and what happens when a region is lost. */
export function regionProblems(design: Design, problem: Problem, run: RunResult): string[] {
  if (!problem.regions) return [];
  const out: string[] = [];
  for (const s of run.scenarios) {
    const spec = problem.scenarios.find((x) => x.id === s.scenarioId);
    if (s.latencyByRegion) {
      const slow = Object.entries(s.latencyByRegion).filter(([, ms]) => ms > problem.latencyTargetMs);
      if (slow.length)
        out.push(
          `In "${s.title}", users in ${slow.map(([r, ms]) => `${regionLabel(regionId(r))} wait ${Math.round(ms)} ms`).join(" and ")} against a ${problem.latencyTargetMs} ms target, because their requests are served from far away.`,
        );
    }
    if (spec?.failure?.target.region && !s.pass)
      out.push(
        `In "${s.title}", ${regionLabel(regionId(spec.failure.target.region))} is lost and only ${(s.served * 100).toFixed(0)}% of requests are served${s.notes.some((n) => /failed over/.test(n)) ? "" : ", and the database has no copy to take over"}.`,
      );
  }
  if (run.findings.some((f) => f.id === "single-region")) out.push("Every block runs in one region.");
  return out;
}

/**
 * The problem's tables and queries, what each database in the design has chosen, and how every query runs as a result.
 * Index settings are written "table:column,column" so a proposal can use the same words.
 */
function describeDataModel(design: Design, problem: Problem): string {
  const dm = problem.dataModel;
  if (!dm) return "";
  const tables = dm.tables.map(
    (t) =>
      `- ${t.id}: ${Math.round(t.rows).toLocaleString()} rows; columns (distinct values): ${t.columns.map((c) => `${c.name} (${Math.round(c.distinct).toLocaleString()}${c.pk ? ", primary key" : ""}${c.monotonic ? ", only grows" : ""})`).join(", ")}`,
  );
  const queries = dm.queries.map(
    (q) =>
      `- ${q.label} [${q.op}, on ${q.table}${q.where?.length ? `, filters by ${q.where.join("+")}` : ""}${q.orderBy?.length ? `, sorted by ${q.orderBy.join("+")}` : ""}${q.page ? `, returns ${q.page}` : ""}${q.depth ? `, deep pages skip ${q.depth}` : ""}]`,
  );
  const dbs = design.nodes
    .filter((n) => n.blockId === "database")
    .map((db) => {
      const dp = planQueries(problem, db.cfg, problem.capabilities ?? []);
      const keys = Array.isArray(db.cfg.shardKeys) && db.cfg.shardKeys.length ? `; shard keys: ${db.cfg.shardKeys.join(", ")}` : "";
      const lines = dp.queries.map(
        (q) =>
          `    ${q.label}: ${q.plan}; ${q.factor <= 1.05 ? "as cheap as possible" : `${q.factor >= 10 ? Math.round(q.factor) : q.factor.toFixed(1)}x the work it needs`}`,
      );
      return `- ${db.id}: indexes: ${dp.indexes.length ? dp.indexes.map(indexText).join(" ") : "none"}${keys}; paging: ${db.cfg.pagination ?? "Offset (page numbers)"}${db.cfg.denormalize ? "; joined data stored together" : ""}\n${lines.join("\n")}`;
    });
  const problems = dataModelProblems(design, problem);
  const verdict = problems.length
    ? `Query problems the simulator found: ${problems.length} (listed again at the end).`
    : "Query problems the simulator found: none. Every query is as cheap as it can be.";
  return `\nData model (the simulator has already costed the queries below, so do not recompute them):\nTables:\n${tables.join("\n")}\nQueries:\n${queries.join("\n")}${dbs.length ? `\nWhat each database chose, and how the queries run:\n${dbs.join("\n")}` : ""}\n${verdict}`;
}

/** Where the users are in each scenario, and where each block runs. */
function describeRegions(design: Design, problem: Problem): string {
  if (!problem.regions) return "";
  const home = regionId(problem.regions.home);
  const where = design.nodes
    .filter((n) => isPlaceable(n.blockId))
    .map((n) => {
      const here = regionId(n.cfg.region, home);
      const copies = n.blockId === "database" ? copyRegions(n.cfg, here) : [];
      return `- ${n.id}: ${regionLabel(here)}${copies.length ? `, with copies in ${copies.map(regionLabel).join(", ")}` : ""}`;
    });
  const mixes = problem.scenarios
    .filter((s) => s.regionMix || s.failure?.target.region)
    .map(
      (s) =>
        `- ${s.title}: users ${
          REGIONS.filter((r) => (s.regionMix?.[r.id] ?? 0) > 0)
            .map((r) => `${r.label} ${Math.round((s.regionMix![r.id] ?? 0) * 100)}%`)
            .join(", ") || `all in ${regionLabel(home)}`
        }${s.failure?.target.region ? `; ${regionLabel(regionId(s.failure.target.region))} goes down` : ""}`,
    );
  return `\nRegions (round trip: US East to Europe 85 ms, US East to Asia Pacific 160 ms, Europe to Asia Pacific 130 ms; every other scenario has all users in ${regionLabel(home)}; the simulator has already worked out the latency by region):\nWhere blocks run:\n${where.join("\n")}\nWhere users are:\n${mixes.join("\n")}`;
}

/** Compact, model-friendly description of the design. */
export function describeDesign(design: Design, problem: Problem): string {
  const lines = design.nodes.map((n) => {
    const def = BLOCK_MAP[n.blockId];
    const cfg = Object.entries(n.cfg)
      .filter(([k, v]) => !k.startsWith("_") && !(Array.isArray(v) && !v.length))
      .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join("|") : v}`)
      .join(", ");
    const runs = capIdsOf(n.blockId, n.capabilities, problem)
      .map((id) => problem.capabilities?.find((c) => c.id === id)?.label)
      .filter(Boolean);
    const resp =
      (n.responsibilities.length ? ` notes: ${n.responsibilities.join("; ")}` : "") + (runs.length ? ` runs: ${runs.join("; ")}` : "");
    // facts the simulator derived, so the reviewer does not have to guess what a setting means
    const m = modelOf(n.blockId, n.cfg, problem.traffic.writeShare);
    const bits: string[] = [];
    if (Number.isFinite(m.capacity)) bits.push(`handles about ${Math.round(m.capacity).toLocaleString()} requests/s in total`);
    if (m.readCapacity !== undefined && m.writeCapacity !== undefined)
      bits.push(
        `takes up to ${Math.round(m.readCapacity).toLocaleString()} reads/s or ${Math.round(m.writeCapacity).toLocaleString()} writes/s (replicas add reads only; writes go to the primary)`,
      );
    if (m.instances > 1) bits.push(`${m.instances} instances, so it survives losing one`);
    else if (n.blockId !== "user") bits.push("a single instance, so it does not survive losing it");
    if (n.blockId === "database") {
      const rr = Number(n.cfg.readReplicas ?? 0);
      bits.push(
        `${1 + rr} copies of the data per shard (1 primary + ${rr} read replica${rr === 1 ? "" : "s"}), ${Number(n.cfg.shards ?? 1)} shard(s), ${n.cfg.engine ?? "Relational"} engine, locking: ${n.cfg.consistency ?? "Eventual"}`,
      );
    }
    if (n.blockId === "user")
      bits.push(`sends ${Math.round(Number(n.cfg.users ?? 0) * Number(n.cfg.reqPerUser ?? 0)).toLocaleString()} requests/s`);
    const cost = blockCost(n.blockId, n.cfg, problem.traffic.writeShare, problem);
    if (cost > 0) bits.push(`costs ${money(cost)} a month`);
    return `- ${n.id}: ${def?.label ?? n.blockId} {${cfg}}${resp}\n    facts: ${bits.join("; ")}`;
  });
  const edges = design.edges.map((e) => `- ${e.source} -${e.kind}-> ${e.target}`);
  return `Blocks:\n${lines.join("\n")}\nConnections:\n${edges.join("\n") || "(none)"}${describeDataModel(design, problem)}${describeRegions(design, problem)}`;
}

/** Correctness guarantees (locks, idempotency, unique ids...) the simulator has already checked, so the reviewer does not re-raise them. */
function verifiedGuarantees(problem: Problem, design: Design): string {
  const hosted = hostedCaps(design, problem);
  const lines: string[] = [];
  for (const n of design.nodes) {
    const caps = hosted.get(n.id) ?? [];
    const unmet = unmetGuarantees(design, n.id, caps);
    for (const cap of caps)
      for (const g of cap.requires ?? []) {
        const ok = !unmet.some((u) => u.cap.id === cap.id && u.guarantee === g);
        lines.push(
          `- "${cap.label}" needs ${GUARANTEE_LABEL[g] ?? g}: ${ok ? "PROVIDED (checked, do not list as a gap)" : "NOT provided"}`,
        );
      }
  }
  return lines.join("\n") || "(none required)";
}

export function buildMessages(problem: Problem, design: Design, run: RunResult) {
  const sim = run.scenarios
    .map(
      (s) =>
        `- ${s.title}: served ${(s.served * 100).toFixed(1)}%, latency ${Math.round(s.latencyMs)}ms${
          s.latencyByRegion
            ? ` (by where users are: ${Object.entries(s.latencyByRegion)
                .map(([r, ms]) => `${regionLabel(regionId(r))} ${Math.round(ms)}ms`)
                .join(", ")}; target ${problem.latencyTargetMs}ms)`
            : ""
        }, ${s.pass ? "PASS" : "FAIL"}. ${s.notes.join(" ")}`,
    )
    .join("\n");
  const findings = run.findings.map((f) => `- [${f.severity}] ${f.title}: ${f.message}`).join("\n");
  const reqs = run.requirements
    .map((r) => `- [${r.id}] (${r.met === null ? "needs your judgement" : r.met ? "met" : "not met"}) ${r.text}`)
    .join("\n");
  const system =
    "You are a staff engineer interviewing a candidate about a system design from a practice tool. Be specific, concise and fair. " +
    "The candidate may use free-text notes to explain a block. " +
    "Each block has a 'facts' line computed by the simulator (capacity, instances, copies, cost): trust it, and never say redundancy or cost information is missing when a facts line gives it. " +
    "Requirements marked met or not met were checked by the simulator: do not re-grade them. Requirements marked 'needs your judgement' are subjective and were left to you. " +
    'Reply with ONLY a JSON object: {"score": 0-100, "summary": string, "strengths": string[], "gaps": string[], "suggestions": string[], ' +
    '"verdicts": [{"id": string, "met": boolean, "reason": string}], ' +
    '"followUps": [{"title": string, "interviewQuestion": string, "trafficMultiplier": number, "failure": {"mode": "down" | "slow", "factor": number, "nodeId": string, "capability": string}, "capabilityLoad": {"<capability id>": number}}]}. ' +
    "verdicts: one for every requirement marked 'needs your judgement' (use its id in square brackets); met is true only when the design or the candidate's own notes actually satisfy it, with a one-sentence reason. " +
    "followUps are your interviewer questions: exactly 3 'what if' tests aimed at the weakest or least-tested part of THIS design, different from the scenarios already tested. " +
    "Each must be something the simulator can run: trafficMultiplier is 0.5 to 8 times normal load; failure (optional) takes one block down or makes it slow (factor 2 to 50) and names it with nodeId (one of the block ids listed) or capability (one of the capability ids listed); capabilityLoad (optional) makes a capability busier (1 to 20 times). " +
    "interviewQuestion is the question you would ask the candidate aloud, one or two sentences." +
    (problem.dataModel
      ? " This problem has a data model. The 'Data model' section lists each query and how it runs in this design; the simulator has already costed them, so use its numbers and do not invent queries. " +
        "In gaps and suggestions, cover every query marked more than about 1.5x the work it needs, and any indexes that make writes dearer than the queries need: say in plain words what goes wrong (reads the whole table, sorts in memory, deep pages, asks every shard, a hot shard key) and what kind of change fixes it, naming the table and columns. If every query is as cheap as possible, say so in strengths."
      : "") +
    (problem.regions
      ? " This problem has users in several regions. The 'Regions' section says where blocks run and where users are in each scenario; the simulator has already worked out latency by region, so do not recompute it. " +
        "Comment on whether users far from the work wait for it, whether losing a region would stop the system, and whether the data has a copy elsewhere. If every block is in one region, say that plainly."
      : "");
  const user = [
    `Problem: ${problem.title} (${problem.difficulty})`,
    problem.brief,
    `Constraints:\n${problem.constraints.map((c) => "- " + c).join("\n")}`,
    problem.capabilities?.length
      ? `Capabilities (the player chooses which block runs each; one block for all = monolith, separate blocks = microservices):\n${problem.capabilities.map((c) => `- ${c.label} (${c.mode === "background" ? "background job" : `${Math.round(c.share * 100)}% of requests, ${c.critical ? "essential" : "optional"}`})`).join("\n")}`
      : "",
    `Design:\n${describeDesign(design, problem)}`,
    run.budget !== undefined
      ? `Cost: ${money(run.cost)} a month against a budget of ${money(run.budget)} (${run.cost <= run.budget ? "within budget" : "OVER budget"}). Per-block costs are listed in the design.`
      : `Cost: ${money(run.cost)} a month.`,
    `Correctness guarantees checked by the simulator:\n${verifiedGuarantees(problem, design)}`,
    `Simulation results:\n${sim}`,
    `Automatic findings:\n${findings || "(none)"}`,
    `The candidate's own explanations (notes they wrote on blocks). Read these before judging any requirement marked 'needs your judgement': a requirement is satisfied if a note explains it well:\n${
      design.nodes
        .filter((n) => n.responsibilities.length)
        .map((n) => `- On ${BLOCK_MAP[n.blockId]?.label ?? n.blockId} (${n.id}): ${n.responsibilities.join("; ")}`)
        .join("\n") || "(the candidate wrote no notes)"
    }`,
    `Requirements:\n${reqs}`,
    `Reviewer rubric:\n${problem.rubric.map((r) => "- " + r).join("\n")}`,
    `Block ids you may target with a failure:\n${design.nodes
      .filter((n) => n.blockId !== "user")
      .map((n) => `- ${n.id}: ${BLOCK_MAP[n.blockId]?.label ?? n.blockId}`)
      .join("\n")}`,
    `Capability ids you may target or scale:\n${(problem.capabilities ?? []).map((c) => `- ${c.id}: ${c.label}`).join("\n") || "(none)"}`,
    `Scenarios already tested (do not repeat them):\n${problem.scenarios.map((x) => "- " + x.title).join("\n")}`,
    "Give 2-5 items per list, and exactly 3 followUps.",
    (() => {
      const must = [...dataModelProblems(design, problem), ...regionProblems(design, problem, run)];
      if (must.length)
        return `MUST COVER. The simulator measured these problems in this design. Write one gap and one suggestion for EACH of them, in plain words (what goes wrong, and what kind of change fixes it, naming the table, columns or region), and do not praise these parts of the design:\n${must.map((m) => "- " + m).join("\n")}`;
      return problem.dataModel || problem.regions
        ? "The simulator found no problems with the data model or with where the blocks run, so you may say so in strengths."
        : "";
    })(),
  ]
    .filter(Boolean)
    .join("\n\n");
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/** Pull the human-readable message out of OpenAI / LM Studio / FastAPI error bodies. */
async function errorText(res: Response): Promise<string> {
  const raw = await res.text();
  try {
    const j = JSON.parse(raw);
    const inner =
      typeof j.detail === "string"
        ? (() => {
            try {
              return JSON.parse(j.detail);
            } catch {
              return j.detail;
            }
          })()
        : (j.detail ?? j);
    const msg = inner?.error?.message ?? inner?.message ?? (typeof inner === "string" ? inner : raw);
    return String(msg).slice(0, 240);
  } catch {
    return raw.slice(0, 240);
  }
}

/**
 * Turn the interviewer's follow-ups into scenarios the simulator can run. The model can only point at things that exist:
 * unknown blocks or capabilities are dropped, numbers are clamped, and a test that changes nothing is discarded.
 */
export function sanitizeFollowUps(raw: unknown, problem: Problem, design: Design): Scenario[] {
  if (!Array.isArray(raw)) return [];
  const nodes = new Map(design.nodes.filter((n) => n.blockId !== "user").map((n) => [n.id, n]));
  const caps = new Map((problem.capabilities ?? []).map((c) => [c.id, c]));
  const num = (v: unknown, lo: number, hi: number, d: number) => {
    const x = Number(v);
    return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d;
  };
  const slug = (t: string) =>
    t
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 28);
  const out: Scenario[] = [];
  raw.forEach((r: any, i) => {
    if (out.length >= 4 || !r || typeof r !== "object") return;
    const question = String(r.interviewQuestion ?? "").trim();
    if (!question) return;
    const title =
      String(r.title ?? "")
        .trim()
        .slice(0, 60) || `Follow-up ${i + 1}`;
    const mult = num(r.trafficMultiplier, 0.5, 8, 1);
    let failure: Failure | undefined;
    let what = "";
    const f = r.failure;
    if (f && typeof f === "object" && (f.mode === "down" || f.mode === "slow")) {
      const target: Failure["target"] = {};
      if (typeof f.nodeId === "string" && nodes.has(f.nodeId)) {
        target.nodeId = f.nodeId;
        what = BLOCK_MAP[nodes.get(f.nodeId)!.blockId]?.label ?? f.nodeId;
      } else if (typeof f.capability === "string" && caps.has(f.capability)) {
        target.capability = f.capability;
        what = `whatever runs "${caps.get(f.capability)!.label}"`;
      }
      if (target.nodeId || target.capability) {
        const factor = f.mode === "slow" ? num(f.factor, 2, 50, 8) : undefined;
        failure = { target, mode: f.mode, factor };
        what += f.mode === "down" ? " goes down" : ` becomes ${factor}x slower`;
      }
    }
    let load: Record<string, number> | undefined;
    if (r.capabilityLoad && typeof r.capabilityLoad === "object")
      for (const [k, v] of Object.entries(r.capabilityLoad)) if (caps.has(k)) (load ??= {})[k] = num(v, 1, 20, 1);
    if (!failure && !load && mult === 1) return; // it would test nothing new
    const parts = [
      what,
      mult !== 1 ? `traffic is ${mult}x normal` : "",
      load
        ? `${Object.entries(load)
            .map(([k, v]) => `"${caps.get(k)!.label}" is ${v}x busier`)
            .join(", ")}`
        : "",
    ].filter(Boolean);
    const description = parts.length ? parts.join("; ").replace(/^./, (c) => c.toUpperCase()) + "." : "A follow-up test.";
    out.push({
      id: `ai-${slug(title) || i}-${i}`,
      title,
      description,
      trafficMultiplier: mult,
      failure,
      capabilityLoad: load,
      interviewQuestion: question.slice(0, 320),
      fromInterviewer: true,
    });
  });
  return out;
}

function parseReview(answer: string, problem: Problem, design: Design): AiReview {
  // reasoning models may put their thinking in the answer between think tags
  const text = answer.replace(/<think>[\s\S]*?<\/think>/g, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("The model did not return JSON.");
  const raw = JSON.parse(text.slice(start, end + 1));
  const arr = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
  return {
    score: Math.max(0, Math.min(100, Math.round(Number(raw.score) || 0))),
    summary: String(raw.summary ?? ""),
    strengths: arr(raw.strengths),
    gaps: arr(raw.gaps),
    suggestions: arr(raw.suggestions),
    verdicts: Array.isArray(raw.verdicts)
      ? raw.verdicts
          .filter((v: any) => v && typeof v.id === "string" && typeof v.met === "boolean")
          .map((v: any) => ({
            id: String(v.id).replace(/^\[|\]$/g, ""),
            met: v.met as boolean,
            reason: String(v.reason ?? "").slice(0, 300),
          }))
      : [],
    followUps: sanitizeFollowUps(raw.followUps, problem, design),
  };
}

/**
 * One call to whichever model is configured.
 * Trust: a key typed in the UI never leaves the browser for OpenAI — we call api.openai.com
 * directly. The FastAPI proxy is only used for LM Studio (CORS) or when the OpenAI key is
 * blank and the server has OPENAI_API_KEY (server key, not the user's).
 */
export async function callModel(settings: AiSettings, messages: { role: string; content: string }[]): Promise<string> {
  if (settings.provider === "off") throw new Error("AI is turned off. Choose LM Studio or OpenAI in AI settings.");
  // Thinking control is LM Studio–only in the UI; OpenAI uses the API default (medium on gpt-6-luna).
  const reasoningEffort =
    settings.provider === "lmstudio" ? (settings.thinking === "off" ? "none" : settings.thinking === "low" ? "low" : undefined) : undefined;
  const model = settings.model || (settings.provider === "openai" ? DEFAULT_OPENAI_MODEL : undefined);
  const body = buildCompletionsBody({ model, messages, temperature: 0.2, reasoningEffort });

  // BYOK OpenAI: browser → OpenAI only (key never posted to our backend).
  const byokOpenAi = settings.provider === "openai" && Boolean(settings.apiKey?.trim());
  const useProxy = cloudOn() && !byokOpenAi;

  let res: Response;
  try {
    if (useProxy) {
      res = await fetch("/api/ai/review", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
        body: JSON.stringify({
          provider: settings.provider,
          baseUrl: settings.baseUrl,
          // never forward a user key; proxy uses OPENAI_API_KEY when provider is openai
          model: body.model,
          messages: body.messages,
          temperature: body.temperature,
          reasoningEffort,
        }),
      });
    } else {
      const base = settings.provider === "openai" ? OPENAI_BASE : settings.baseUrl.replace(/\/$/, "");
      res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {}) },
        body: JSON.stringify(body),
      });
    }
  } catch {
    throw new Error(
      settings.provider === "lmstudio"
        ? "Could not reach LM Studio. Start its local server and enable CORS (or run the FastAPI backend)."
        : "Could not reach the AI endpoint. Check the network, base URL and key.",
    );
  }
  if (!res.ok) throw new Error(`AI request failed (${res.status}): ${await errorText(res)}`);
  const json = await res.json();
  const choice = json?.choices?.[0];
  const content: string = choice?.message?.content ?? "";
  if (!content.trim()) {
    throw new Error(
      choice?.finish_reason === "length"
        ? "The model ran out of room while thinking, so it never wrote an answer. Raise its context length in LM Studio, or use a non-reasoning model."
        : "The model returned an empty answer. Try again, or pick another model.",
    );
  }
  return content;
}

export async function reviewDesign(settings: AiSettings, problem: Problem, design: Design, run: RunResult): Promise<AiReview> {
  const content = await callModel(settings, buildMessages(problem, design, run));
  return parseReview(content, problem, design);
}
