import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadLessons } from "./load";
import { LessonParseError, parseLesson } from "./parse";

const FM = "---\ntitle: T\nminutes: 5\n---\n";
const PAGE = "## P {#p-one}\n\nSome text.\n";

/** the error a malformed lesson produces, as "file:line: message" */
const err = (src: string): string => {
  try {
    parseLesson("bad.md", src);
  } catch (e) {
    expect(e).toBeInstanceOf(LessonParseError);
    return (e as Error).message;
  }
  throw new Error("expected a parse error");
};

describe("parseLesson: valid", () => {
  const sample = readFileSync(new URL("../../content/lessons/_sample-placeholder.md", import.meta.url), "utf8");
  const lesson = parseLesson("_sample-placeholder.md", sample);

  it("reads front matter and pages", () => {
    expect(lesson.title).toMatch(/Sample lesson/);
    expect(lesson.minutes).toBe(5);
    expect(lesson.pages.map((p) => p.id)).toEqual(["sample-first-page", "sample-second-page"]);
  });
  it("keeps glossary markers in text", () => {
    const b = lesson.pages[0].blocks[0];
    expect(b.kind === "text" && b.text).toContain("[[server]]");
    expect(b.kind === "text" && b.text).toContain("[[capacity|limit]]");
  });
  it("reads demo, quiz and summary blocks", () => {
    expect(lesson.pages[0].blocks[1]).toMatchObject({ kind: "demo", demo: "d1-cache" });
    const quiz = lesson.pages[1].blocks[1];
    expect(quiz.kind === "quiz" && quiz.options.map((o) => o.correct)).toEqual([false, true, false]);
    expect(quiz.kind === "quiz" && quiz.explanation).toBe("The explanation is one short sentence.");
    expect(lesson.pages[1].blocks[2]).toMatchObject({ kind: "summary", items: ["First placeholder point.", "Second placeholder point."] });
  });
  it("joins wrapped lines into one paragraph and splits on blank lines", () => {
    const l = parseLesson("x.md", `${FM}## P {#p}\n\nOne\ntwo.\n\nThree.\n`);
    expect(l.pages[0].blocks.map((b) => b.kind === "text" && b.text)).toEqual(["One two.", "Three."]);
  });
  it("accepts CRLF line endings", () => {
    expect(parseLesson("x.md", (FM + PAGE).replace(/\n/g, "\r\n")).pages).toHaveLength(1);
  });
});

describe("parseLesson: errors name the file and line", () => {
  it("missing front matter", () => expect(err("## P {#p}\nText\n")).toMatch(/^bad\.md:1: a lesson must start with front matter/));
  it("unclosed front matter", () => expect(err("---\ntitle: T\nminutes: 5\n")).toMatch(/^bad\.md:1: front matter is not closed/));
  it("missing title", () => expect(err("---\nminutes: 5\n---\n" + PAGE)).toMatch(/non-empty "title:"/));
  it("bad minutes", () => expect(err("---\ntitle: T\nminutes: soon\n---\n" + PAGE)).toMatch(/"minutes:" as a whole number/));
  it("unknown front matter key", () =>
    expect(err("---\ntitle: T\nminutes: 5\nauthor: A\n---\n" + PAGE)).toMatch(/^bad\.md:4: unknown front matter key "author"/));
  it("text before any page", () => expect(err(FM + "Loose text\n")).toMatch(/^bad\.md:5: content must be inside a page/));
  it("a lesson with no pages", () => expect(err(FM)).toMatch(/at least one page/));
  it("empty page, in the middle", () => expect(err(FM + "## A {#a}\n\n## B {#b}\nText\n")).toMatch(/^bad\.md:5: page "A" is empty/));
  it("empty page, at the end", () => expect(err(FM + PAGE + "\n## Z {#z}\n")).toMatch(/page "Z" is empty/));
  it("heading without an id", () => expect(err(FM + "## No id\nText\n")).toMatch(/^bad\.md:5: a page heading needs a title and an id/));
  it("bad page id", () => expect(err(FM + "## T {#Bad_Id}\nText\n")).toMatch(/must be lower-case words/));
  it("duplicate page id", () => expect(err(FM + PAGE + "\n## Q {#p-one}\nText\n")).toMatch(/page id "p-one" is used twice/));
  it("other heading levels", () => {
    expect(err(FM + "# Title\n")).toMatch(/only "##" page headings/);
    expect(err(FM + PAGE + "### Sub\n")).toMatch(/only "##" page headings/);
  });
  it("unknown block", () => expect(err(FM + PAGE + "::: video\n:::\n")).toMatch(/^bad\.md:8: unknown block "video"/));
  it("block without a name", () => expect(err(FM + PAGE + ":::\n")).toMatch(/stray ":::"/));
  it("unclosed block", () => expect(err(FM + PAGE + "::: summary\n- a\n")).toMatch(/^bad\.md:8: "summary" block is never closed/));
  it("nested block", () => expect(err(FM + PAGE + "::: summary\n::: demo x\n:::\n")).toMatch(/cannot be nested/));
  it("stray closing line", () => expect(err(FM + PAGE + ":::\n")).toMatch(/stray ":::"/));
  it("lists outside blocks", () => expect(err(FM + "## P {#p}\n- a\n")).toMatch(/lists are only allowed inside/));

  describe("demo", () => {
    it("needs an id", () => expect(err(FM + PAGE + "::: demo\n:::\n")).toMatch(/needs an id/));
    it("rejects a malformed id", () => expect(err(FM + PAGE + "::: demo Bad_ID\n:::\n")).toMatch(/needs an id/));
    it("must be empty", () => expect(err(FM + PAGE + "::: demo d-x\nextra\n:::\n")).toMatch(/must be empty/));
  });

  describe("quiz", () => {
    const quiz = (body: string) => FM + PAGE + `::: quiz\n${body}:::\n`;
    it("zero correct answers", () => expect(err(quiz("Q?\n- [ ] a\n- [ ] b\n> why\n"))).toMatch(/exactly one correct answer .*found 0/));
    it("two correct answers", () => expect(err(quiz("Q?\n- [x] a\n- [x] b\n> why\n"))).toMatch(/exactly one correct answer .*found 2/));
    it("fewer than two answers", () => expect(err(quiz("Q?\n- [x] a\n> why\n"))).toMatch(/at least two answers/));
    it("no explanation", () => expect(err(quiz("Q?\n- [ ] a\n- [x] b\n"))).toMatch(/short explanation/));
    it("no question", () => expect(err(quiz("- [ ] a\n- [x] b\n> why\n"))).toMatch(/needs a question/));
    it("malformed answer", () => expect(err(quiz("Q?\n- a\n- [x] b\n> why\n"))).toMatch(/^bad\.md:10: an answer looks like/));
    it("explanation before answers", () => expect(err(quiz("Q?\n> why\n- [ ] a\n- [x] b\n"))).toMatch(/must come after the answers/));
    it("question after answers", () => expect(err(quiz("Q?\n- [ ] a\nMore\n- [x] b\n> why\n"))).toMatch(/question must come before/));
    it("arguments on the opening line", () =>
      expect(err(FM + PAGE + "::: quiz extra\nQ?\n- [ ] a\n- [x] b\n> w\n:::\n")).toMatch(/takes no arguments/));
  });

  describe("summary", () => {
    it("must not be empty", () => expect(err(FM + PAGE + "::: summary\n:::\n")).toMatch(/at least one bullet/));
    it("holds only bullets", () => expect(err(FM + PAGE + "::: summary\nText\n:::\n")).toMatch(/only bullet lines/));
  });
});

describe("loadLessons", () => {
  it("skips fixtures that start with an underscore unless asked to load them", () => {
    expect(loadLessons(undefined, false)).toEqual([]);
    expect(loadLessons(undefined, true).map((l) => l.id)).toEqual(["_sample-placeholder"]);
  });
  it("parses and sorts the files it is given", () => {
    const src = { "/c/b.md": FM + PAGE, "/c/a.md": FM + PAGE, "/c/_skip.md": "not a lesson" };
    expect(loadLessons(src, false).map((l) => l.file)).toEqual(["a.md", "b.md"]);
  });
  it("reports the file of a malformed lesson", () => {
    expect(() => loadLessons({ "/c/oops.md": "no front matter" }, false)).toThrow(/^oops\.md:1:/);
  });
});
