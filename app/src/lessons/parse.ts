import type { Lesson, LessonBlock, LessonPage, QuizOption } from "./types";

/*
  The lesson format is deliberately small. Anything not described here is an error, so a typo cannot silently turn into text.

    ---
    title: Requests and blocks
    minutes: 12
    ---

    ## Page title {#page-id}

    A paragraph. Blank lines separate paragraphs. [[Capacity]] and [[term|label]] markers are kept as written.

    ::: demo demo-id
    :::

    ::: quiz
    The question, on one or more lines.
    - [ ] A wrong answer
    - [x] The one right answer
    > A short explanation, shown after answering.
    :::

    ::: summary
    - One point per line.
    :::

  Page headings are the only headings. Page ids are lower-case words joined by hyphens.
*/

export class LessonParseError extends Error {
  constructor(
    public file: string,
    public line: number,
    detail: string,
  ) {
    super(`${file}:${line}: ${detail}`);
    this.name = "LessonParseError";
  }
}

const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const PAGE_HEADING = /^##\s+(.+?)\s+\{#([^}\s]*)\}\s*$/;
const OPEN = /^:::\s*(\S+)?\s*(.*?)\s*$/;
const OPTION = /^-\s+\[( |x)\]\s+(.+)$/;
const BULLET = /^-\s+(.+)$/;

export function parseLesson(file: string, source: string): Lesson {
  const lines = (source.charCodeAt(0) === 0xfeff ? source.slice(1) : source).split(/\r?\n/);
  const fail = (line: number, detail: string): never => {
    throw new LessonParseError(file, line, detail);
  };

  // ----- front matter -----
  if (lines[0]?.trim() !== "---")
    fail(1, 'a lesson must start with front matter: a line of "---", then "title:" and "minutes:", then "---"');
  const meta: Record<string, string> = {};
  let i = 1;
  for (; i < lines.length && lines[i].trim() !== "---"; i++) {
    const m = /^(\w+):\s*(.*)$/.exec(lines[i]);
    if (!m) {
      if (lines[i].trim() === "") continue;
      fail(i + 1, `front matter lines look like "key: value", found "${lines[i]}"`);
    } else {
      if (m[1] !== "title" && m[1] !== "minutes") fail(i + 1, `unknown front matter key "${m[1]}" (only title and minutes are allowed)`);
      if (m[1] in meta) fail(i + 1, `front matter key "${m[1]}" appears twice`);
      meta[m[1]] = m[2].trim();
    }
  }
  if (i >= lines.length) fail(1, 'front matter is not closed with a line of "---"');
  if (!meta.title) fail(i + 1, 'front matter needs a non-empty "title:"');
  if (!/^[1-9]\d*$/.test(meta.minutes ?? "")) fail(i + 1, 'front matter needs "minutes:" as a whole number above zero');

  // ----- pages and blocks -----
  const pages: LessonPage[] = [];
  let page: LessonPage | undefined;
  let para: { line: number; parts: string[] } | undefined;

  const flushPara = () => {
    if (para && page) page.blocks.push({ kind: "text", line: para.line, text: para.parts.join(" ") });
    para = undefined;
  };
  const add = (block: LessonBlock) => {
    flushPara();
    page!.blocks.push(block);
  };

  for (i += 1; i < lines.length; i++) {
    const raw = lines[i];
    const text = raw.trim();
    const n = i + 1;

    if (text === "") {
      flushPara();
      continue;
    }

    const open = text.startsWith(":::") ? OPEN.exec(text) : null;
    if (open) {
      if (!page) fail(n, "content must be inside a page; start one with a heading such as: ## Title {#page-id}");
      flushPara();
      const name = open[1];
      const arg = open[2];
      if (!name) fail(n, 'a stray ":::" closes a block that was never opened');
      if (name !== "demo" && name !== "quiz" && name !== "summary") fail(n, `unknown block "${name}" (use demo, quiz or summary)`);
      const start = n;
      const body: { line: number; text: string }[] = [];
      for (i += 1; i < lines.length && lines[i].trim() !== ":::"; i++) {
        if (lines[i].trim().startsWith(":::")) fail(i + 1, `blocks cannot be nested; "${name}" opened on line ${start} is not closed`);
        body.push({ line: i + 1, text: lines[i].trim() });
      }
      if (i >= lines.length) fail(start, `"${name}" block is never closed (add a line of ":::")`);
      if (name === "demo") {
        if (!arg || !ID.test(arg))
          fail(start, 'a demo needs an id after the name, such as "::: demo d0-one-server" (lower-case words joined by hyphens)');
        if (body.some((b) => b.text !== ""))
          fail(body.find((b) => b.text !== "")!.line, "a demo block must be empty; put explanatory text in a paragraph");
        add({ kind: "demo", line: start, demo: arg });
      } else {
        if (arg) fail(start, `"${name}" takes no arguments on its opening line`);
        add(name === "quiz" ? parseQuiz(start, body, fail) : parseSummary(start, body, fail));
      }
      continue;
    }

    if (text.startsWith(":::")) fail(n, 'a stray ":::" closes a block that was never opened');

    const h = HEADING.exec(text);
    if (h) {
      flushPara();
      const m = PAGE_HEADING.exec(text);
      if (h[1] !== "##") fail(n, `only "##" page headings are allowed, found "${h[1]}"`);
      if (!m) fail(n, "a page heading needs a title and an id: ## Title {#page-id}");
      const [, title, id] = m!;
      if (!ID.test(id)) fail(n, `page id "${id}" must be lower-case words joined by hyphens`);
      if (pages.some((p) => p.id === id)) fail(n, `page id "${id}" is used twice`);
      if (page && page.blocks.length === 0) fail(page.line, `page "${page.title}" is empty`);
      page = { id, title, line: n, blocks: [] };
      pages.push(page);
      continue;
    }

    if (!page) fail(n, "content must be inside a page; start one with a heading such as: ## Title {#page-id}");
    if (BULLET.test(text) && !para) fail(n, 'lists are only allowed inside a "summary" or "quiz" block');
    if (!para) para = { line: n, parts: [] };
    para.parts.push(text);
  }
  flushPara();

  if (!pages.length) fail(lines.length, "a lesson needs at least one page");
  const last = pages[pages.length - 1];
  if (last.blocks.length === 0) fail(last.line, `page "${last.title}" is empty`);

  return { id: file.replace(/\.md$/, ""), file, title: meta.title, minutes: Number(meta.minutes), pages };
}

type Fail = (line: number, detail: string) => never;
type Body = { line: number; text: string }[];

function parseQuiz(start: number, body: Body, fail: Fail): LessonBlock {
  const question: string[] = [];
  const options: QuizOption[] = [];
  const explanation: string[] = [];
  for (const { line, text } of body) {
    if (text === "") continue;
    const opt = OPTION.exec(text);
    if (text.startsWith(">")) {
      if (!options.length) fail(line, "the explanation (a line starting with >) must come after the answers");
      explanation.push(text.replace(/^>\s?/, ""));
    } else if (opt) {
      if (explanation.length) fail(line, "answers must come before the explanation");
      options.push({ text: opt[2], correct: opt[1] === "x" });
    } else if (text.startsWith("-")) {
      fail(line, 'an answer looks like "- [ ] text" or "- [x] text"');
    } else {
      if (options.length || explanation.length) fail(line, "the question must come before the answers");
      question.push(text);
    }
  }
  if (!question.length) fail(start, "a quiz needs a question before its answers");
  if (options.length < 2) fail(start, "a quiz needs at least two answers");
  const correct = options.filter((o) => o.correct).length;
  if (correct !== 1) fail(start, `a quiz needs exactly one correct answer ("- [x]"), found ${correct}`);
  if (!explanation.length) fail(start, "a quiz needs a short explanation, written as a line starting with >");
  return { kind: "quiz", line: start, question: question.join(" "), options, explanation: explanation.join(" ") };
}

function parseSummary(start: number, body: Body, fail: Fail): LessonBlock {
  const items: string[] = [];
  for (const { line, text } of body) {
    if (text === "") continue;
    const m = BULLET.exec(text);
    if (!m) fail(line, 'a summary holds only bullet lines starting with "- "');
    items.push(m![1]);
  }
  if (!items.length) fail(start, "a summary needs at least one bullet");
  return { kind: "summary", line: start, items };
}
