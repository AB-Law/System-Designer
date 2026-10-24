import { describe, expect, it } from "vitest";
import library from "../problems/library_management.json";
import { GLOSSARY } from "../roadmap/glossary";
import { ROADMAP } from "../roadmap/roadmap";
import type { RoadmapStage } from "../roadmap/types";
import { DEMO_IDS } from "../lessons/demos";
import type { Design, Problem } from "../types";
import { PROBLEMS_NEEDING_A_REFERENCE, REFERENCE_DESIGNS } from "./referenceDesigns";
import {
  checkContent,
  checkLessonReferences,
  checkReferenceDesign,
  formatIssue,
  glossaryKeys,
  parseAll,
  type ContentInput,
} from "./validate";

const problems = Object.values(import.meta.glob("../problems/*.json", { eager: true, import: "default" }) as Record<string, Problem>);
const lessonSources = import.meta.glob("../../content/lessons/*.md", { query: "?raw", import: "default", eager: true }) as Record<
  string,
  string
>;
const glossaryTerms = GLOSSARY.map((g) => g.term);
const base = (over: Partial<ContentInput> = {}): ContentInput => ({
  sources: {},
  problems,
  roadmap: ROADMAP,
  demoIds: ["sample-demo"],
  glossaryTerms,
  references: {},
  needReference: [],
  ...over,
});

const FM = "---\ntitle: T\nminutes: 5\n---\n";
const good = (extra = "") => `${FM}## P {#p-one}\n\nText about a [[server]].\n${extra}`;

describe("shipped content", () => {
  it("is mechanically sound", () => {
    const sources = Object.fromEntries(Object.entries(lessonSources).map(([p, t]) => [p.split("/").pop()!, t]));
    const issues = checkContent({
      sources,
      problems,
      roadmap: ROADMAP,
      demoIds: DEMO_IDS,
      glossaryTerms,
      references: REFERENCE_DESIGNS,
      needReference: PROBLEMS_NEEDING_A_REFERENCE,
    });
    expect(issues.map(formatIssue)).toEqual([]);
  });
});

describe("a failing fixture for each check", () => {
  it("lesson that does not parse", () => {
    const issues = checkContent(base({ sources: { "bad.md": "no front matter" } }));
    expect(issues).toContainEqual(expect.objectContaining({ check: "lesson", where: "bad.md:1" }));
  });
  it("reports every malformed lesson, not just the first", () => {
    const { issues } = parseAll({ "a.md": "x", "b.md": "y" });
    expect(issues.map((i) => i.where)).toEqual(["a.md:1", "b.md:1"]);
  });
  it("demo that is not registered", () => {
    const issues = checkContent(base({ sources: { "l.md": good("\n::: demo no-such-demo\n:::\n") } }));
    expect(issues).toContainEqual({ check: "demo", where: "l.md:9", message: 'demo "no-such-demo" is not registered' });
  });
  it("glossary marker that is not a term, including inside a quiz and a summary", () => {
    const quiz = "\n::: quiz\nWhat is a [[flurb]]?\n- [ ] a\n- [x] b\n> why\n:::\n::: summary\n- the [[blarg|thing]]\n:::\n";
    const issues = checkContent(base({ sources: { "l.md": good(quiz) } })).filter((i) => i.check === "glossary");
    expect(issues.map((i) => i.message)).toEqual(["[[flurb]] is not a glossary term", "[[blarg]] is not a glossary term"]);
  });
  it("glossary markers must match exactly, not loosely", () => {
    // the reader would accept "serv" as a near match for "server"; the check must not
    const { lessons } = parseAll({ "l.md": `${FM}## P {#p}\n\nA [[serv]].\n` });
    expect(checkLessonReferences(lessons, [], glossaryTerms)).toHaveLength(1);
  });
  it("roadmap stage pointing at a missing lesson", () => {
    const roadmap: RoadmapStage[] = ROADMAP.map((s, i) => (i === 0 ? { ...s, lesson: "ghost" } : s));
    expect(checkContent(base({ roadmap }))).toContainEqual({
      check: "roadmap",
      where: ROADMAP[0].id,
      message: 'points at lesson "ghost", which does not exist',
    });
  });
  it("roadmap stage with no problems", () => {
    const roadmap = [...ROADMAP, { id: "empty", title: "E", blurb: "", steps: [] }];
    expect(checkContent(base({ roadmap }))).toContainEqual({ check: "roadmap", where: "empty", message: "has no problems" });
  });
  it("problem missing from, or unknown to, the roadmap", () => {
    const fewer = ROADMAP.map((s, i) => (i === 0 ? { ...s, steps: s.steps.slice(1) } : s));
    expect(checkContent(base({ roadmap: fewer })).some((i) => i.check === "roadmap" && /is not on the path/.test(i.message))).toBe(true);
    expect(
      checkContent(base({ problems: problems.slice(1) })).some((i) => i.check === "roadmap" && /no problem file/.test(i.message)),
    ).toBe(true);
  });
  it("reference design that is missing, or fails the scenarios", () => {
    const lib = library as unknown as Problem;
    expect(checkReferenceDesign(lib, undefined)[0].message).toMatch(/no reference design/);
    const empty: Design = { nodes: [], edges: [] };
    expect(checkReferenceDesign(lib, empty).some((i) => /fails scenario/.test(i.message))).toBe(true);
  });
  it("reference design for a problem that does not exist, or a new problem with none", () => {
    expect(checkContent(base({ references: { ghost: { nodes: [], edges: [] } } }))).toContainEqual(
      expect.objectContaining({ where: "ghost" }),
    );
    expect(checkContent(base({ needReference: ["ghost"] }))).toContainEqual(expect.objectContaining({ where: "ghost" }));
  });
});

describe("glossaryKeys", () => {
  it("reads both marker forms", () => {
    expect(glossaryKeys("a [[cache]] and [[hit ratio|hits]] and [[ queue ]]")).toEqual(["cache", "hit ratio", "queue"]);
  });
});
