export type Tier = "strong" | "building" | "needs_work" | "early" | "none";

export interface Target {
  id: number;
  title: string;
  level: string;
  company: string | null;
  hasJd: boolean;
  roleId: number | null;
  scoreRunId: number | null;
  /** ISO date (YYYY-MM-DD) of the interview, if set. */
  date: string | null;
  created: number;
  jdText?: string | null;
}

export interface ActiveTarget extends Target {
  daysLeft: number | null;
}

export interface TargetInput {
  title: string;
  level?: string;
  company?: string | null;
  jdText?: string | null;
  roleId?: number | null;
  scoreRunId?: number | null;
  date?: string | null;
}

export interface TopicCard {
  slug: string;
  label: string;
  tier: Tier;
  strength: number | null;
  points: number;
  relevant: boolean;
  sources: string[];
}

export interface Gap {
  id: string;
  text: string;
  kind: "must" | "nice";
  status: "missing" | "partial";
  points: number;
}

export interface Fit {
  runId: number;
  total: number | null;
  band: string | null;
  gaps: Gap[];
}

export interface NextAction {
  key: string;
  title: string;
  why: string;
  module: string;
  href: string;
}

export interface Activity {
  module: string;
  ref: string;
  at: number;
  topics: string[];
}

export interface Streak {
  days: number;
  week: { date: string; active: boolean }[];
}

export interface SetupStep {
  key: string;
  title: string;
  hint: string;
  href: string;
  done: boolean;
  module: string;
}

export interface Summary {
  setup: SetupStep[];
  target: ActiveTarget | null;
  targets: Target[];
  readiness: TopicCard[];
  fit: Fit | null;
  actions: NextAction[];
  activity: Activity[];
  streak: Streak;
  dataPoints: number;
  modules: string[];
}
