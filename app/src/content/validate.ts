import { analyze } from "../sim/analyze";
import type { Design, Problem } from "../types";
import { LessonParseError, parseLesson } from "../lessons/parse";
import type { Lesson } from "../lessons/types";
import { checkRoadmap } from "../roadmap/validate";
import type { RoadmapStage } from "../roadmap/types";

/*
  Mechanical checks on lessons and the roadmap. These catch broken references and malformed content. They cannot tell whether a
  lesson is accurate, clear, or gives away the next problem's answer: that stays in the human review checklist.
*/

export type ContentCheck = "lesson" | "demo" | "glossary" | "roadmap" | "reference";
export interface ContentIssue {
  check: ContentCheck;
  /** file and line, problem id, or stage id */
  where: string;
  message: string;
}

export const formatIssue = (i: ContentIssue): string => `[${i.check}] ${i.where}: ${i.message}`;

/** Parse every lesson source, reporting each malformed file instead of stopping at the first. */
export function parseAll(sources: Record<string, string>): { lessons: Lesson[]; issues: ContentIssue[] } {
  const lessons: Lesson[] = [];
  const issues: ContentIssue[] = [];
  for (const [file, text] of Object.entries(sources).sort(([a], [b]) => a.localeCompare(b))) {
    try {
      lessons.push(parseLesson(file, text));
    } catch (e) {
      if (!(e instanceof LessonParseError)) throw e;
      issues.push({ check: "lesson", where: `${e.file}:${e.line}`, message: e.message.replace(`${e.file}:${e.line}: `, "") });
    }
  }
  return { lessons, issues };
}

const MARKER = /\[\[([^\]]+)\]\]/g;

/** Glossary terms named by `[[term]]` or `[[term|label]]` markers in a piece of text. */
export function glossaryKeys(text: string): string[] {
  return [...text.matchAll(MARKER)].map((m) => {
    const inner = m[1];
    const pipe = inner.indexOf("|");
    return (pipe >= 0 ? inner.slice(0, pipe) : inner).trim();
  });
}

/** Every piece of text in a lesson that the reader will run through the glossary. */
function lessonTexts(lesson: Lesson): { where: string; text: string }[] {
  const out: { where: string; text: string }[] = [];
  for (const page of lesson.pages) {
    for (const b of page.blocks) {
      const where = `${lesson.file}:${b.line}`;
      if (b.kind === "text") out.push({ where, text: b.text });
      else if (b.kind === "summary") b.items.forEach((t) => out.push({ where, text: t }));
      else if (b.kind === "quiz") out.push({ where, text: [b.question, ...b.options.map((o) => o.text), b.explanation].join("\n") });
    }
  }
  return out;
}

/**
 * Demo references and glossary markers. A marker must match a glossary term exactly (ignoring case): the reader is more forgiving
 * and would show a near match, which would hide a typo.
 */
export function checkLessonReferences(lessons: Lesson[], demoIds: string[], glossaryTerms: string[]): ContentIssue[] {
  const issues: ContentIssue[] = [];
  const terms = new Set(glossaryTerms.map((t) => t.toLowerCase()));
  for (const lesson of lessons) {
    for (const page of lesson.pages)
      for (const b of page.blocks)
        if (b.kind === "demo" && !demoIds.includes(b.demo))
          issues.push({ check: "demo", where: `${lesson.file}:${b.line}`, message: `demo "${b.demo}" is not registered` });
    for (const { where, text } of lessonTexts(lesson))
      for (const key of glossaryKeys(text))
        if (!terms.has(key.toLowerCase())) issues.push({ check: "glossary", where, message: `[[${key}]] is not a glossary term` });
  }
  return issues;
}

/** The roadmap checks from `checkRoadmap`, written as readable issues. */
export function checkRoadmapContent(problems: Problem[], roadmap: RoadmapStage[], lessons: Lesson[]): ContentIssue[] {
  const lessonIds = lessons.map((l) => l.id);
  return checkRoadmap(problems, roadmap, lessonIds).map((i): ContentIssue => {
    switch (i.kind) {
      case "unknown":
        return { check: "roadmap", where: i.problemId, message: "is on the path but has no problem file" };
      case "duplicate":
        return { check: "roadmap", where: i.problemId, message: `appears ${i.count} times on the path (expected once)` };
      case "missing":
        return { check: "roadmap", where: i.problemId, message: "is not on the path" };
      case "count_mismatch":
        return { check: "roadmap", where: "path", message: `has ${i.steps} steps but there are ${i.problems} problems` };
      case "empty":
        return { check: "roadmap", where: "path", message: "is empty" };
      case "empty_stage":
        return { check: "roadmap", where: i.stageId, message: "has no problems" };
      case "duplicate_stage":
        return { check: "roadmap", where: i.stageId, message: "stage id is used twice" };
      case "unknown_lesson":
        return { check: "roadmap", where: i.stageId, message: `points at lesson "${i.lesson}", which does not exist` };
    }
  });
}

/**
 * A reference design must pass every scenario and every requirement the simulator can decide; AI-judged requirements are skipped.
 * This runs the real `analyze`, so it says the design passes the simulator, not that the problem teaches well.
 */
export function checkReferenceDesign(problem: Problem, design: Design | undefined): ContentIssue[] {
  if (!design) return [{ check: "reference", where: problem.id, message: "has no reference design registered" }];
  const run = analyze(design, problem);
  const issues: ContentIssue[] = [];
  for (const s of run.scenarios)
    if (!s.pass)
      issues.push({
        check: "reference",
        where: problem.id,
        message: `reference design fails scenario "${s.scenarioId}": ${s.reasons[0] ?? s.notes[0] ?? "no reason given"}`,
      });
  for (const r of run.requirements)
    if (r.met === false)
      issues.push({ check: "reference", where: problem.id, message: `reference design misses requirement "${r.id}": ${r.detail}` });
  return issues;
}

export interface ContentInput {
  /** lesson file name -> text */
  sources: Record<string, string>;
  problems: Problem[];
  roadmap: RoadmapStage[];
  demoIds: string[];
  glossaryTerms: string[];
  references: Record<string, Design>;
  needReference: string[];
}

/** Everything above in one call. An empty list means the content is mechanically sound. */
export function checkContent(input: ContentInput): ContentIssue[] {
  const { lessons, issues } = parseAll(input.sources);
  issues.push(...checkLessonReferences(lessons, input.demoIds, input.glossaryTerms));
  issues.push(...checkRoadmapContent(input.problems, input.roadmap, lessons));
  for (const id of input.needReference) {
    const problem = input.problems.find((p) => p.id === id);
    if (!problem) issues.push({ check: "reference", where: id, message: "needs a reference design but there is no such problem" });
    else issues.push(...checkReferenceDesign(problem, input.references[id]));
  }
  for (const id of Object.keys(input.references))
    if (!input.problems.some((p) => p.id === id))
      issues.push({ check: "reference", where: id, message: "reference design belongs to no problem" });
  return issues;
}
