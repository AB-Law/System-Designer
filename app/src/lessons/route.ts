/** Where a learner is in the lessons, kept in the URL hash so reload, back and a pasted link all work. */
export interface LearnRoute {
  lessonId?: string;
  pageId?: string;
}

const PART = "_?[a-z0-9]+(?:-[a-z0-9]+)*";
const LEARN = new RegExp(`^#/learn(?:/(${PART}))?(?:/(${PART}))?$`);

/** Read `#/learn`, `#/learn/<lesson>` or `#/learn/<lesson>/<page>`; anything else is not a lesson link. */
export function parseLearnHash(hash: string): LearnRoute | null {
  const m = LEARN.exec(hash);
  if (!m) return null;
  return { lessonId: m[1], pageId: m[2] };
}

export function learnHash(r: LearnRoute = {}): string {
  if (!r.lessonId) return "#/learn";
  return r.pageId ? `#/learn/${r.lessonId}/${r.pageId}` : `#/learn/${r.lessonId}`;
}
