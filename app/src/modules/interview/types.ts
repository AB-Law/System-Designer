export type Category = "behavioral" | "technical" | "system_design" | "company";
export type Tone = "friendly" | "tough";
export type SessionStatus = "planning" | "active" | "ended" | "failed";
export type TurnTag = "question" | "answer" | "follow-up" | "transition" | "closing";

export const CATEGORIES: Category[] = ["behavioral", "technical", "system_design", "company"];
export const CATEGORY_LABELS: Record<Category, string> = {
  behavioral: "Behavioral",
  technical: "Technical",
  system_design: "System design",
  company: "Company",
};

export interface Style {
  tone: Tone;
  durationMin: number;
  categories: Category[];
  counts: Partial<Record<Category, number>>;
  showPlan: boolean;
  useCv: boolean;
}

export interface RoleSummary {
  id: number;
  title: string;
  level: string;
  company: string | null;
  hasJd: boolean;
  sourceScoreRunId: number | null;
  created: number;
}

export interface RoleInput {
  title?: string;
  level?: string;
  company?: string | null;
  jdText?: string | null;
  scoreRunId?: number | null;
}

export interface SessionSummary {
  id: number;
  roleId: number;
  roleTitle: string;
  company: string | null;
  status: SessionStatus;
  score: number | null;
  style: Style;
  turnCount: number;
  created: number;
  ended: number | null;
}

export interface Turn {
  idx: number;
  role: "interviewer" | "candidate";
  tag: TurnTag;
  text: string;
  created: number;
}

export interface PlanItem {
  category: Category;
  question: string;
  focus: string;
  jd_link?: string;
}

export interface AnswerFeedback {
  ref: number;
  category: Category;
  focus: string;
  question: string;
  answer: string;
  score: number;
  strengths: string[];
  gaps: string[];
  better: string;
  jdLink?: string;
  jdFit?: string;
  rubric: string[];
}

export interface Feedback {
  perAnswer: AnswerFeedback[];
  summary: {
    strengths: string[];
    gaps: string[];
    practiceNext: string[];
    byCategory: Partial<Record<Category, number>>;
    score: number | null;
  };
  promptVersion: string;
}

export interface SessionDetail {
  id: number;
  roleId: number;
  role: RoleSummary;
  style: Style;
  status: SessionStatus;
  error: string | null;
  planJobId: string | null;
  feedbackJobId: string | null;
  plan: PlanItem[] | null;
  turns: Turn[];
  startedAt: number | null;
  serverNow: number;
  score: number | null;
  created: number;
  ended: number | null;
  feedback: Feedback | null;
}

/** One event of the interviewer's reply stream. */
export type StreamEvent =
  | { type: "start"; tag: TurnTag }
  | { type: "delta"; text: string }
  | { type: "done"; turn: Turn; finished: boolean; feedbackJobId: string | null }
  | { type: "error"; message: string };

export interface ScoreRunOption {
  id: number;
  jdTitle: string;
  cvName?: string;
  mode?: "fast" | "deep";
  total?: number | null;
  created?: number;
}

export type DocScope = "global" | "role";
export type DocStatus = "queued" | "running" | "ready" | "failed";

export interface DocSummary {
  id: number;
  name: string;
  scope: DocScope;
  roleId: number | null;
  status: DocStatus;
  error: string | null;
  chunkCount: number;
  jobId: string | null;
  bytes: number;
  created: number;
  updated: number;
}

export interface DocChunk {
  index: number;
  page: number;
  text: string;
}

export type BankStatus = "running" | "ready" | "failed";

/** One researched question. `storeId` is null for a question the user added; those have no source. */
export interface BankItem {
  ref: string;
  storeId: number | null;
  question: string;
  category: Category;
  kind: "question" | "culture" | "engineering";
  sourceUrl: string;
  sourceName: string;
  fetched: number;
}

export interface Bank {
  id: number;
  roleId: number;
  status: BankStatus;
  error: string | null;
  jobId: string | null;
  items: BankItem[];
  updated: number;
}

export interface ResearchStart {
  bankId: number;
  jobId: string;
  /** False when the server has no search key, so only saved questions are shown. */
  searchConfigured: boolean;
}

export interface ResearchResult {
  skipped: "no_search" | "no_results" | null;
  added: number;
  items: number;
}

export interface Usage {
  monthTokens: number;
  quota: number;
}
