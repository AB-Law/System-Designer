import { BLOCKS, money } from "../blocks";
import type { AdvisorProposal, AdvisorResult, Change, Design, Dimension, Problem, RunResult } from "../types";
import { CATALOG, describeChange, sanitizeChanges } from "./chat";
import { dataModelProblems, describeDesign, regionProblems } from "./review";

export const DIMENSION_LABEL: Record<Dimension, string> = {
  scalability: "Scalability",
  reliability: "Reliability",
  faultIsolation: "Fault isolation",
  latency: "Latency",
};

/** The ratings below 100, with the simulator's own reasons, so the model fixes what the simulator measured. */
function weakSpots(run: RunResult, focus?: Dimension): string {
  const dims = (Object.keys(DIMENSION_LABEL) as Dimension[]).filter((d) => (focus ? d === focus : run.confidence[d] < 100));
  return dims
    .map((d) => {
      const det = run.confidenceDetail[d];
      const items = det.items.map((i) => `    ${i.good === null ? "-" : i.good ? "ok" : "MISSING"}: ${i.label} = ${i.value}`).join("\n");
      return `- ${DIMENSION_LABEL[d]} ${run.confidence[d]}/100. ${det.how}\n${items}${det.tip ? `\n    tip: ${det.tip}` : ""}`;
    })
    .join("\n");
}

const FORMAT =
  "Reply with ONLY one JSON object, no text before or after it, in this shape:\n" +
  '{"summary":"one or two sentences on the main finding","proposals":[{"title":"short name, under 8 words","why":"2 to 4 plain sentences: what problem this solves, how the change solves it, and the trade-off or cost","changes":[{"op":"add_block","ref":"c1","blockId":"cache","settings":{"hitRatio":0.9}},{"op":"connect","from":"s","to":"c1","kind":"sync"},{"op":"set_settings","nodeId":"s","settings":{"replicas":4}},{"op":"disconnect","from":"a","to":"b"}]}]}\n' +
  "Rules: a proposal is a small set of changes that only make sense together, and it must work on its own (never refer to a ref from another proposal). " +
  "blockId must be exactly one of: " +
  BLOCKS.filter((b) => b.id !== "user")
    .map((b) => b.id)
    .join(", ") +
  ". ref is a short name you invent for a new block so later changes can point at it. nodeId, from and to are ids of blocks on the canvas (or a ref from the same proposal). kind is sync, async or both. " +
  "To put a cache in front of a database: add the cache, connect the block that reads to the cache, connect the cache to the database, and disconnect the reader from the database. A queue between two blocks works the same way. A new block does nothing until it is connected. " +
  'At most 3 proposals, at most 5 changes each, most important first. In settings list ONLY the settings you change from their defaults, and keep \'why\' under 60 words. Use only the settings listed below. A setting written like region[A|B|C] takes ONE of the options, for example "region":"Europe", never the whole list. Setting a list replaces the whole list. ' +
  "The learner is a beginner: in 'why' use plain words and explain any term the first time. Do not think aloud.";

/** Constrains a local model to the advisor's JSON, so it cannot ramble before the answer. */
export const ADVISOR_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    proposals: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          why: { type: "string" },
          changes: {
            type: "array",
            items: {
              type: "object",
              properties: {
                op: { type: "string", enum: ["add_block", "set_settings", "connect", "disconnect"] },
                ref: { type: "string" },
                blockId: { type: "string" },
                nodeId: { type: "string" },
                from: { type: "string" },
                to: { type: "string" },
                kind: { type: "string", enum: ["sync", "async", "both"] },
                settings: { type: "object" },
              },
              required: ["op"],
            },
          },
        },
        required: ["title", "why", "changes"],
      },
    },
  },
  required: ["summary", "proposals"],
};

export function buildAdvisorMessages(problem: Problem, design: Design, run: RunResult, mode: "fix" | "tune", focus?: Dimension) {
  const task =
    mode === "fix"
      ? "TASK: the learner's design is missing something for the ratings listed under 'Weak spots'. Propose the blocks, connections and settings that raise those ratings, and for each say why. " +
        "Fix the items marked MISSING first. Prefer adding the missing kind of block (a replica, a queue, a second region, a load balancer) over only raising a number. Add nothing that does not fix a listed weak spot."
      : "TASK: review the learner's current setup and suggest improvements, including changes to settings. Look for: a structural fix that makes a big number unnecessary (a CDN or cache in front of servers that read the same data over and over; a queue to smooth bursts), blocks far over- or under-sized for the traffic, a missing connection, and cost that could be cut without failing a scenario. " +
        "When traffic is high, first ask whether a CDN or cache would absorb most of it before suggesting more servers. Do not lower the User block's traffic to make the design pass: the traffic is the test. Only change settings of the User block if they differ from what the problem states. " +
        "Say what you would leave alone too, in the summary. Suggest nothing for a part that is already fine.";
  const system =
    "You are a system design coach inside a practice tool. " +
    task +
    " Every proposal must come with the reasoning that teaches why it works. Trust the simulator's numbers and 'facts' lines; do not recompute them. Never mention a reference solution.\n\n" +
    FORMAT +
    "\n\nBlocks and settings you may use (the User block's settings are users and reqPerUser):\n" +
    CATALOG +
    "\n- user (User): users, reqPerUser";

  const measured = [...dataModelProblems(design, problem), ...regionProblems(design, problem, run)];
  const bad = run.findings.filter((f) => f.severity === "bad" || f.severity === "warn");
  const results = run.scenarios
    .map(
      (s) =>
        `- ${s.title}: ${s.pass ? "PASS" : "FAIL"}, served ${Math.round(s.served * 100)}%, ${Math.round(s.latencyMs)} ms${s.pass ? "" : ". " + s.reasons.join(" ")}`,
    )
    .join("\n");
  const user = [
    `Problem: ${problem.title} (${problem.difficulty})`,
    problem.brief,
    `Constraints:\n${problem.constraints.map((c) => "- " + c).join("\n")}`,
    problem.capabilities?.length
      ? `Capabilities the design must run (ids): ${problem.capabilities.map((c) => `${c.id} (${c.label})`).join(", ")}`
      : "",
    `Scenarios:\n${problem.scenarios.map((s) => `- ${s.title}: ${s.description}`).join("\n")}`,
    `Canvas right now:\n${describeDesign(design, problem)}`,
    `Cost: ${money(run.cost)} a month${run.budget !== undefined ? ` of a ${money(run.budget)} budget` : ""}.`,
    `Simulator results:\n${results}`,
    `Weak spots:\n${weakSpots(run, focus) || "none: every rating is 100"}`,
    bad.length ? `Problems the simulator found:\n${bad.map((f) => `- ${f.title}: ${f.message}`).join("\n")}` : "",
    measured.length ? `Measured data model and region problems:\n${measured.map((m) => "- " + m).join("\n")}` : "",
    mode === "fix" ? "Now propose the fixes as JSON." : "Now review this setup and answer as JSON.",
  ]
    .filter(Boolean)
    .join("\n\n");
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/** Every top-level {...} in the text, found by matching braces (strings aware), so prose around the JSON cannot break it. */
function jsonObjects(text: string): string[] {
  const out: string[] = [];
  for (let i = text.indexOf("{"); i >= 0 && i < text.length; i = text.indexOf("{", i + 1)) {
    let depth = 0;
    let inStr = false;
    for (let j = i; j < text.length; j++) {
      const ch = text[j];
      if (inStr) {
        if (ch === "\\") j++;
        else if (ch === '"') inStr = false;
      } else if (ch === '"') inStr = true;
      else if (ch === "{") depth++;
      else if (ch === "}" && --depth === 0) {
        out.push(text.slice(i, j + 1));
        i = j;
        break;
      }
    }
  }
  return out;
}

/**
 * Pull the answer out of a reply that may carry thinking, a code fence, or chatter around it. A reply cut off by the model's
 * context limit has no closing braces, so the proposals that were finished are kept and the rest is lost.
 */
function extractJson(reply: string): { raw: any; cutOff: boolean } | undefined {
  const text = reply.replace(/<think>[\s\S]*?<\/think>/g, "");
  const found = jsonObjects(text).flatMap((c) => {
    try {
      return [JSON.parse(c)];
    } catch {
      return [];
    }
  });
  const whole = found.reverse().find((v) => v && typeof v === "object" && Array.isArray(v.proposals));
  if (whole) return { raw: whole, cutOff: false };
  const parts = found.filter((v) => v && typeof v === "object" && Array.isArray(v.changes) && typeof v.why === "string");
  // objects nested in a finished proposal are found too, so keep only the ones that are not inside another
  const proposals = parts.filter((p) => p.changes.every((c: any) => c && typeof c === "object" && typeof c.op === "string"));
  return proposals.length ? { raw: { summary: "", proposals }, cutOff: true } : undefined;
}

/**
 * Small models often put a new block in front of something (connect A to X, disconnect A from B) and forget to connect X on to B,
 * which cuts B off. Add the missing onward connection, using the kind of the connection that was removed.
 */
export function repairWiring(input: Change[], design: Design): Change[] {
  // the other half: a new block put between A and B, but the direct A to B connection is left in place, so it is bypassed
  const added = new Set(input.flatMap((c) => (c.op === "add_block" ? [c.ref] : [])));
  const bypass: Change[] = [];
  for (const a of input) {
    if (a.op !== "connect" || !added.has(a.to)) continue;
    for (const b of input) {
      if (b.op !== "connect" || b.from !== a.to || added.has(b.to)) continue;
      const direct = design.edges.some((e) => e.source === a.from && e.target === b.to);
      const gone = input.some((c) => c.op === "disconnect" && c.from === a.from && c.to === b.to);
      if (direct && !gone && !bypass.some((c) => c.op === "disconnect" && c.from === a.from && c.to === b.to))
        bypass.push({ op: "disconnect", from: a.from, to: b.to });
    }
  }
  const changes = [...input, ...bypass];
  const out = [...changes];
  const edges = [...design.edges.map((e) => [e.source, e.target] as const)];
  for (const c of changes) if (c.op === "connect") edges.push([c.from, c.to]);
  for (const c of changes) {
    if (c.op !== "disconnect") continue;
    const old = design.edges.find((e) => e.source === c.from && e.target === c.to);
    // new blocks that the removed connection's caller now calls
    for (const x of changes) {
      if (x.op !== "connect" || x.from !== c.from || !changes.some((a) => a.op === "add_block" && a.ref === x.to)) continue;
      const hasOnward = edges.some(([s, t]) => s === x.to && t !== c.from);
      if (!hasOnward) {
        out.push({ op: "connect", from: x.to, to: c.to, kind: old?.kind ?? "sync" });
        edges.push([x.to, c.to]);
      }
    }
  }
  return out;
}

/**
 * Turn the model's reply into proposals the learner can approve one by one. A proposal with any change that cannot be
 * applied is dropped whole, since half of it may not make sense (a connection removed and its replacement lost).
 */
export function parseAdvisor(reply: string, problem: Problem, design: Design, mode: "fix" | "tune", focus?: Dimension): AdvisorResult {
  const got = extractJson(reply);
  if (!got)
    throw new Error(
      "The model did not give a usable answer. Its reply may have been cut short: in LM Studio, raise the model's context length (this prompt needs about 4,000 tokens plus room to answer), or pick a larger model, then try again.",
    );
  const { raw, cutOff } = got;
  const proposals: AdvisorProposal[] = [];
  let rejected = 0;
  for (const p of (Array.isArray(raw.proposals) ? raw.proposals : []).slice(0, 3)) {
    const clean = sanitizeChanges(Array.isArray(p?.changes) ? p.changes : [], problem, design);
    const dropped = clean.dropped;
    const changes = repairWiring(clean.changes, design);
    if (dropped > 0 || !changes.length || typeof p?.why !== "string") {
      rejected++;
      continue;
    }
    proposals.push({
      id: `p${proposals.length + 1}`,
      title: String(p.title || "Suggested change").slice(0, 80),
      why: String(p.why).slice(0, 900),
      changes,
      summary: changes.map((c) => describeChange(c, design, changes)),
      status: "pending",
    });
  }
  let summary = typeof raw.summary === "string" ? raw.summary.slice(0, 600) : "";
  if (!proposals.length && rejected)
    summary += `${summary ? " " : ""}(The model's suggestions used blocks or settings that do not exist here, so none could be offered. Try again.)`;
  if (cutOff && proposals.length)
    summary += `${summary ? " " : ""}(The model's answer was cut off, so only the finished suggestions are shown. A longer context length in LM Studio avoids this.)`;
  return { mode, focus, summary, proposals };
}
