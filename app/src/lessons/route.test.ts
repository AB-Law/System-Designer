import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseLesson } from "./parse";
import { pagesSeen, recordPage, resumePageId } from "./progress";
import { learnHash, parseLearnHash } from "./route";

describe("learn routes", () => {
  it("round-trips the list, a lesson and a page", () => {
    for (const r of [{}, { lessonId: "module-0" }, { lessonId: "module-0", pageId: "m0-capacity" }]) {
      expect(parseLearnHash(learnHash(r))).toEqual({ lessonId: r.lessonId, pageId: r.pageId });
    }
  });
  it("ignores other addresses, including shared designs", () => {
    for (const h of ["", "#share=abcdefgh", "#d=z.abc", "#/learning", "#/learn/Bad_Id", "#/learn/a__b", "#/learn/a/b/c"])
      expect(parseLearnHash(h)).toBeNull();
  });
});

describe("lesson progress", () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
  });
  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });
  const lesson = parseLesson("l.md", "---\ntitle: T\nminutes: 5\n---\n## A {#a}\nx\n## B {#b}\ny\n");

  it("starts on the first page, then resumes where the learner left off", () => {
    expect(resumePageId(lesson)).toBe("a");
    recordPage("l", "b");
    expect(resumePageId(lesson)).toBe("b");
  });
  it("counts opened pages, and ignores a remembered page that no longer exists", () => {
    recordPage("l", "a");
    recordPage("l", "gone");
    expect(pagesSeen(lesson)).toBe(1);
    expect(resumePageId(lesson)).toBe("a");
  });
  it("works when storage is unavailable", () => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
    expect(resumePageId(lesson)).toBe("a");
    expect(() => recordPage("l", "a")).not.toThrow();
  });
});
