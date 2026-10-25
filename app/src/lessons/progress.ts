import { lsGet, lsSet } from "../api";
import type { Lesson } from "./types";

/*
  Reading progress is a convenience kept in this browser only (it is not synced to an account). Nothing depends on it:
  every problem opens whether or not a lesson was read.
*/
export const LESSONS_LS_KEY = "dc:lessons";

interface LessonState {
  /** page the learner was last on */
  page?: string;
  /** pages that have been opened */
  seen?: string[];
}
type Store = Record<string, LessonState>;

const load = (): Store => lsGet<Store>(LESSONS_LS_KEY, {});

/** The page to open when a lesson is opened with no page named: where the learner left off, else the first page. */
export function resumePageId(lesson: Lesson): string {
  const saved = load()[lesson.id]?.page;
  return lesson.pages.some((p) => p.id === saved) ? saved! : lesson.pages[0].id;
}

/** Remember that a page is open now. */
export function recordPage(lessonId: string, pageId: string): void {
  const all = load();
  const cur = all[lessonId] ?? {};
  const seen = new Set(cur.seen ?? []);
  seen.add(pageId);
  lsSet(LESSONS_LS_KEY, { ...all, [lessonId]: { page: pageId, seen: [...seen] } });
}

/** How many of a lesson's pages have been opened. Pages that no longer exist are not counted. */
export function pagesSeen(lesson: Lesson): number {
  const seen = new Set(load()[lesson.id]?.seen ?? []);
  return lesson.pages.filter((p) => seen.has(p.id)).length;
}
