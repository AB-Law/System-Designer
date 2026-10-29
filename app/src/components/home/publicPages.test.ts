import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PUBLIC_LESSONS } from "./publicPages";

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

describe("PUBLIC_LESSONS", () => {
  it("matches the lesson files that prerender.mjs turns into /learn/<slug>/", () => {
    const files = [0, 1, 2, 3, 4, 5].map((n) => readFileSync(`content/lessons/module-${n}.md`, "utf8"));
    const found = files.map((f) => {
      const title = /^title: (.+)$/m.exec(f)?.[1].trim() ?? "";
      const minutes = Number(/^minutes: (\d+)$/m.exec(f)?.[1]);
      return { slug: slug(title), title, minutes };
    });
    expect([...PUBLIC_LESSONS]).toEqual(found);
  });
});
