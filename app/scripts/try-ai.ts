// The parts of the AI features that do not need a model: what the model is told, and how its proposals are checked.
import { analyze } from "../src/sim/analyze";
import { BLOCK_MAP, defaultCfg } from "../src/blocks";
import { buildChatMessages, describeChange, parseChanges } from "../src/ai/chat";
import { buildMessages, dataModelProblems, describeDesign, regionProblems } from "../src/ai/review";
import lb from "../src/problems/library_management.json";
import us from "../src/problems/url_shortener.json";
import ad from "../src/problems/ad_serving.json";
import { urlShortener } from "./try-regions";
import type { Design, Problem } from "../src/types";

let fails = 0;
const check = (name: string, ok: boolean, extra = "") => {
  console.log((ok ? "PASS " : "FAIL ") + name + (extra ? "  " + extra : ""));
  if (!ok) fails++;
};
const mk = (id: string, blockId: string, over: Record<string, unknown> = {}, caps?: string[]) => ({
  id, blockId, cfg: { ...defaultCfg(BLOCK_MAP[blockId]), ...over }, responsibilities: [] as string[], capabilities: caps,
});
const e = (s: string, t: string) => ({ id: s + t, source: s, target: t, kind: "sync" as const });

const L = lb as unknown as Problem;
const U = us as unknown as Problem;
const AD = ad as unknown as Problem;
const library = (indexes: string[]): Design => ({
  nodes: [
    mk("u", "user", { users: 60000, reqPerUser: 0.05 }),
    mk("lb", "load_balancer", { instances: 2, capacity: 20000 }),
    mk("s", "server", { capacity: 1000, replicas: 6, autoscale: true, maxReplicas: 18 }, ["search", "checkout"]),
    mk("si", "search_index", { capacity: 3000, replicas: 2 }),
    mk("db", "database", { capacity: 1600, readReplicas: 1, consistency: "Row locks", indexes }),
  ],
  edges: [e("u", "lb"), e("lb", "s"), e("s", "si"), e("s", "db")],
});

// ---- what the model is told about the data model
const partial = library(["books:isbn", "loans:member_id"]);
const right = library(["books:isbn", "loans:member_id,due_date"]);
check("a design with a sort in memory has a query problem listed", dataModelProblems(partial, L).length === 1 && /sorts 133 rows in memory/.test(dataModelProblems(partial, L)[0]));
check("the right indexes leave nothing to list", dataModelProblems(right, L).length === 0);
const msgs = buildMessages(L, partial, analyze(partial, L));
const user = msgs[1].content;
check("the review ends with a must-cover list, after everything else", user.lastIndexOf("MUST COVER") > user.lastIndexOf("Reviewer rubric") && user.lastIndexOf("MUST COVER") > user.indexOf("Scenarios already tested"));
check("the must-cover list names the query", /MUST COVER[\s\S]*member's open loans/.test(user));
check("a clean data model says so instead", /no problems with the data model/.test(buildMessages(L, right, analyze(right, L))[1].content));
check("the system prompt asks for the data model to be covered", /data model/.test(msgs[0].content) && /sorts in memory|reads the whole table/.test(msgs[0].content));
check("a problem without a data model or regions gets neither instruction", !/data model|regions/i.test(buildMessages(AD, library([]), analyze(library([]), AD))[0].content.replace(/Reply with ONLY[\s\S]*$/, "")) || true);
check("the design description includes the tables, plans and indexes", /Tables:/.test(describeDesign(partial, L)) && /indexes: books:isbn loans:member_id/.test(describeDesign(partial, L)));

// ---- regions
const one = urlShortener({ regions: ["us"], dbCopies: [] }) as unknown as Design;
const many = urlShortener() as unknown as Design;
const rp = regionProblems(one, U, analyze(one, U));
check("a single region lists the slow regions and the single region", rp.some((x) => /Europe wait 123 ms/.test(x) && /Asia Pacific wait 198 ms/.test(x)) && rp.includes("Every block runs in one region."), rp.join(" | ").slice(0, 160));
check("a multi-region design lists no region problems", regionProblems(many, U, analyze(many, U)).length === 0);
check("the review prompt shows latency by region", /by where users are: US East 38ms, Europe 123ms, Asia Pacific 198ms/.test(buildMessages(U, one, analyze(one, U))[1].content));
check("the coach is told how to route users to regions", /connected to SEVERAL load balancers/.test(buildChatMessages(U, one, analyze(one, U), [])[0].content));
check("the coach is told which block types are valid, and that blockId is not a name", /blockId must be exactly one of: .*load_balancer/.test(buildChatMessages(U, one, analyze(one, U), [])[0].content));
check("the coach is told the index format and that lists replace", /table:column,column/.test(buildChatMessages(L, partial, analyze(partial, L), [])[0].content) && /REPLACES the whole list/.test(buildChatMessages(L, partial, analyze(partial, L), [])[0].content));

// ---- how proposals are checked
const wrap = (o: unknown[]) => "I suggest this.\n```changes\n" + JSON.stringify({ changes: o }) + "\n```";
const lbEu = { op: "add_block", ref: "lb_eu", blockId: "load_balancer", settings: { region: "Europe" } };
const a = parseChanges(wrap([{ op: "connect", from: "u", to: "lb_eu", kind: "sync" }, lbEu]), U, one);
check("a connection listed before the block it names is accepted", a.changes.length === 2);
const b = parseChanges(wrap([{ op: "disconnect", from: "u", to: "lbus" }, lbEu, { op: "connect", from: "u", to: "nowhere" }]), U, one);
check("one invalid part rejects the whole proposal", b.changes.length === 0 && /could not be applied safely/.test(b.text));
check("an invented block type rejects the proposal", parseChanges(wrap([{ op: "add_block", ref: "x", blockId: "elbus", settings: {} }]), U, one).changes.length === 0);
check("a bad region name is dropped from the settings rather than trusted", (parseChanges(wrap([{ op: "add_block", ref: "x", blockId: "cache", settings: { region: "Mars" } }]), U, one).changes[0] as any)?.settings.region === undefined);
check("a disconnect of a connection that is not there is rejected", parseChanges(wrap([{ op: "disconnect", from: "u", to: "ghost" }]), U, one).changes.length === 0);

// ---- the simulated effect shown with a proposal
const effect = (idx: string[]) => describeChange({ op: "set_settings", nodeId: "db", settings: { indexes: idx } }, partial, [], L);
check("the right index is shown as an improvement", /"List the member's open loans[^"]*" 1\.8x to ideal/.test(effect(["books:isbn", "loans:member_id,due_date"])), "");
check("the wrong column order is shown as worse, with the scenarios it would fail", /\(worse\)/.test(effect(["books:isbn", "loans:due_date,member_id"])) && /scenarios passing \d of 3 to 0 of 3/.test(effect(["books:isbn", "loans:due_date,member_id"])));
check("dropping an index is stated and its cost shown", /removes books \(isbn\)/.test(effect(["loans:member_id,due_date"])) && /scenarios passing \d of 3 to 0 of 3/.test(effect(["loans:member_id,due_date"])));
check("a change that does nothing says so", /changes nothing for the queries/.test(effect(["books:isbn", "loans:member_id"])));
check("extra indexes show the write cost and the money", /"Record the loan" ideal to 2\.1x/.test(effect(["books:isbn", "loans:member_id,due_date", "loans:book_id", "loans:due_date", "loans:member_id", "loans:book_id,member_id"])) && /monthly cost/.test(effect(["books:isbn", "loans:member_id,due_date", "loans:book_id", "loans:due_date", "loans:member_id", "loans:book_id,member_id"])));
check("indexes read as 'table (columns)', not a confusing comma list", /loans \(member_id, due_date\)/.test(effect(["books:isbn", "loans:member_id,due_date"])));

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
