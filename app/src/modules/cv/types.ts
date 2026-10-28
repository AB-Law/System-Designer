export type Band = "strong" | "fair" | "weak";
export type Mode = "fast" | "deep";
export type ReqStatus = "met" | "partial" | "missing";

export interface Role {
  employer: string;
  title: string;
  start: string;
  end: string;
  location: string;
  bullets: string[];
}
export interface Education {
  school: string;
  degree: string;
  start: string;
  end: string;
}
export interface Project {
  name: string;
  link: string;
  bullets: string[];
}
export interface CvStructure {
  name: string;
  headline: string;
  email: string;
  links: string[];
  summary: string;
  skills: string[];
  experience: Role[];
  education: Education[];
  projects: Project[];
}

export interface VersionInfo {
  id: number;
  cvId: number;
  fileId: number | null;
  parseQuality: number;
  warnings: string[];
  structureSource: "rules" | "model" | "edited" | "rewrite";
  edited: boolean;
  created: number;
}
export interface VersionFull extends VersionInfo {
  rawText: string;
  structure: CvStructure;
  totalYears: number;
}
export interface CvSummary {
  id: number;
  name: string;
  active: boolean;
  created: number;
  versionCount: number;
  latest: VersionInfo | null;
}
export interface CvDetail {
  id: number;
  name: string;
  active: boolean;
  created: number;
  latest: VersionFull | null;
  versions: VersionInfo[];
  jobId?: string;
}

export interface Evidence {
  quote: string;
  line: number | null;
  page: number | null;
}
export interface Match {
  id: string;
  text: string;
  kind: "must" | "nice";
  status: ReqStatus;
  method: string;
  strength: number;
  evidence: Evidence[];
  reason: string;
}
export interface Component {
  key: string;
  label: string;
  score: number | null;
  detail: string;
  weight: number;
}
export interface Gap {
  id: string;
  text: string;
  kind: "must" | "nice";
  status: ReqStatus;
  points: number;
}
export interface Rewrite {
  id: number;
  runId: number;
  bulletRef: string;
  original: string;
  proposed: string;
  reason: string;
  status: "pending" | "approved" | "rejected" | "applied";
}
export interface RunSummary {
  id: number;
  cvVersionId: number;
  jdTitle: string;
  mode: Mode;
  rubricVersion: string;
  model: string;
  status: "queued" | "running" | "done" | "failed";
  jobId: string | null;
  total: number | null;
  band: Band | null;
  error: string | null;
  rescoredFrom: number | null;
  created: number;
  truncated: boolean;
  cvId?: number;
  cvName?: string;
}
export interface Run extends RunSummary {
  jdText: string;
  breakdown: { total: number; components: Component[]; cap: { limit: number; reason: string } | null };
  evidence: Match[];
  analysis: {
    title: string;
    level: string;
    min_years: number | null;
    domain: string;
    talking_points: string[];
    questions_to_ask: string[];
    gaps: Gap[];
    cv_years: number;
    skill_years: Record<string, number>;
  };
  stages: Record<string, unknown>;
  rewrites: Rewrite[];
}

export interface Job {
  id: string;
  status: "queued" | "running" | "done" | "failed" | "cancelled";
  progress: number;
  message: string;
  error: string | null;
}

export interface ProviderInfo {
  id: string;
  label: string;
  available: boolean;
  defaultModel: string;
}
export interface LlmSettings {
  providers: ProviderInfo[];
  current: { provider: string; model: string } | null;
  effective: { provider: string; model: string };
  usage: { monthTokens: number; quota: number };
}
