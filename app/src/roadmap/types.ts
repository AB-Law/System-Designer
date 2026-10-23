export interface RoadmapStage {
  id: string;
  title: string;
  blurb: string;
  steps: RoadmapStep[];
}

export interface RoadmapStep {
  problemId: string;
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
