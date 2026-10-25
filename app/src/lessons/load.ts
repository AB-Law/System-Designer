import { parseLesson } from "./parse";
import type { Lesson } from "./types";

// Lessons are bundled with the app, so they read offline. Files starting with "_" are placeholders for tests and development:
// they are only bundled and loaded by the dev server, never in a production build.
const real = import.meta.glob(["../../content/lessons/*.md", "!../../content/lessons/_*.md"], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;
const fixtures = (
  import.meta.env.DEV ? import.meta.glob("../../content/lessons/_*.md", { query: "?raw", import: "default", eager: true }) : {}
) as Record<string, string>;
const files = { ...real, ...fixtures };

export function loadLessons(sources: Record<string, string> = files, withFixtures: boolean = import.meta.env.DEV): Lesson[] {
  return Object.entries(sources)
    .map(([path, text]) => ({ file: path.split("/").pop()!, text }))
    .filter((f) => withFixtures || !f.file.startsWith("_"))
    .sort((a, b) => a.file.localeCompare(b.file))
    .map((f) => parseLesson(f.file, f.text));
}

/** True when there is something to read. The Learn entry stays hidden until the first lesson ships. */
export function hasLessons(): boolean {
  try {
    return loadLessons().length > 0;
  } catch {
    return true; // a broken lesson should be seen, not hidden
  }
}

let cached: Lesson[] | undefined;
/** The lessons, parsed once. A lesson that cannot be read gives an empty list here; the Learn screen reports the error itself. */
export function lessonIndex(): Lesson[] {
  if (cached) return cached;
  try {
    cached = loadLessons();
  } catch {
    cached = [];
  }
  return cached;
}
