/** What a module offers once its lesson is read. Everything here is optional reading, never a gate. */
export interface ModuleWrapUp {
  /** the ideas the module covered, one short line each */
  recap: string[];
  /** an optional, ungraded prompt. It is never scored or used to unlock anything */
  reflection?: string;
}

/** A stage of the path. From Roadmap v2 a stage is a module: it can point at a lesson and carry a wrap-up. */
export interface RoadmapStage {
  id: string;
  title: string;
  blurb: string;
  /** id of a lesson in `app/content/lessons/` (its file name without ".md"). Leave out while a stage has no lesson. */
  lesson?: string;
  wrapUp?: ModuleWrapUp;
  steps: RoadmapStep[];
}

export interface RoadmapStep {
  problemId: string;
  /** One page of the stage's lesson that prepares for this problem. Set only where it is unambiguous. */
  lessonPage?: string;
  minutes: number;
  youWillLearn: string[];
  newIdeas: string[];
  primer: string[];
  watchOutFor: string;
  reflect: string[];
}

export interface GlossaryEntry {
  term: string;
  plain: string;
  /** Problem id where this idea first appears on the path. */
  where: string;
  /** Lesson page that introduces the idea, once one exists. `where` stays valid either way. */
  lesson?: { lesson: string; page: string };
}

export type StepStatus = "done" | "in_progress" | "next" | "not_started";

export interface RoadmapPrefs {
  primersRead?: string[];
  skipOrderHint?: boolean;
}

export interface StepProgress {
  problemId: string;
  status: StepStatus;
  bestScore: number | null;
  stepIndex: number; // 1-based across the whole path
  stageId: string;
  stageTitle: string;
  stageIndex: number; // 1-based
}
