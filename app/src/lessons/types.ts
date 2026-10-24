/** A lesson as parsed from `app/content/lessons/*.md`. See `parse.ts` for the format. */
export interface Lesson {
  /** the file name without ".md"; what a roadmap module's `lesson` refers to */
  id: string;
  /** file name the lesson was read from, used in error messages */
  file: string;
  title: string;
  /** estimated minutes for a real read-through, interactions included */
  minutes: number;
  pages: LessonPage[];
}

export interface LessonPage {
  /** stable id, written as `## Title {#id}` */
  id: string;
  title: string;
  /** line of the heading in the source file (1-based) */
  line: number;
  blocks: LessonBlock[];
}

export interface QuizOption {
  text: string;
  correct: boolean;
}

export type LessonBlock =
  /** one paragraph; `[[term]]` and `[[term|label]]` markers are left in place for the glossary renderer */
  | { kind: "text"; line: number; text: string }
  /** a reference to a registered demo (checked by content validation, not by the parser) */
  | { kind: "demo"; line: number; demo: string }
  | { kind: "quiz"; line: number; question: string; options: QuizOption[]; explanation: string }
  | { kind: "summary"; line: number; items: string[] };
