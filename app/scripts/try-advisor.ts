// Runs the AI advisor against a local LM Studio server: npx tsx scripts/try-advisor.ts [model] [fix|tune]
import { analyze } from "../src/sim/analyze";
import { BLOCK_MAP, defaultCfg } from "../src/blocks";
import { ADVISOR_SCHEMA, buildAdvisorMessages, parseAdvisor } from "../src/ai/advisor";
import { callModel } from "../src/ai/review";
import us from "../src/problems/url_shortener.json";
import type { Design, Problem } from "../src/types";

const mk = (id: string, blockId: string, over: Record<string, unknown> = {}) => ({
  id,
  blockId,
  cfg: { ...defaultCfg(BLOCK_MAP[blockId]), ...over },
  responsibilities: [] as string[],
});
const e = (s: string, t: string) => ({ id: s + t, source: s, target: t, kind: "sync" as const });
const P = us as unknown as Problem;
// one server and one database, with the server scaled up a lot to cope with the traffic
const design: Design = {
  nodes: [mk("u", "user"), mk("s", "server", { replicas: 40 }), mk("db", "database")],
  edges: [e("u", "s"), e("s", "db")],
};
const model = process.argv[2] ?? "google/gemma-4-e4b";
const mode = (process.argv[3] ?? "fix") as "fix" | "tune";
const run = analyze(design, P);
console.log("confidence", run.confidence, "score", run.score);
const t = Date.now();
const reply = await callModel(
  { provider: "lmstudio", baseUrl: "http://localhost:1234/v1", apiKey: "", model, thinking: "off" },
  buildAdvisorMessages(P, design, run, mode),
  ADVISOR_SCHEMA,
);
console.log(`reply in ${Math.round((Date.now() - t) / 1000)}s`);
if (process.env.RAW) console.log(reply);
const res = parseAdvisor(reply, P, design, mode);
console.log(res.summary);
for (const p of res.proposals) console.log(`\n# ${p.title}\n${p.why}\n${p.summary.map((l) => " - " + l).join("\n")}`);
console.log(`\n${res.proposals.length} proposals`);
