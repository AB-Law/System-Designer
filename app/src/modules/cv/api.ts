import { call, postBinary } from "../../api";
import type { CvDetail, CvStructure, CvSummary, Job, LlmSettings, Mode, Rewrite, Run, RunSummary } from "./types";

export const cvApi = {
  list: () => call<CvSummary[]>("/cv"),
  get: (id: number) => call<CvDetail>(`/cv/${id}`),
  upload: (file: File, name?: string) => postBinary<CvDetail>("/cv/upload", { name: file.name, ...(name ? { cvName: name } : {}) }, file),
  uploadJd: (file: File) =>
    postBinary<{ text: string; parseQuality: number; warnings: string[] }>("/cv/jd/upload", { name: file.name }, file),
  rename: (id: number, name: string) => call<CvDetail>(`/cv/${id}`, "PATCH", { name }),
  saveStructure: (id: number, s: CvStructure) => call<CvDetail>(`/cv/${id}/structure`, "PATCH", s),
  reExtract: (id: number) => call<{ jobId: string }>(`/cv/${id}/extract`, "POST"),
  activate: (id: number) => call<CvDetail>(`/cv/${id}/activate`, "POST"),
  remove: (id: number) => call<{ ok: boolean }>(`/cv/${id}`, "DELETE"),
  score: (jds: { text: string; title: string }[], mode: Mode, cvId?: number) =>
    call<{ runs: { id: number; jobId: string | null; cached: boolean; status: string }[] }>("/cv/score", "POST", {
      cvId: cvId ?? null,
      mode,
      jds,
    }),
  run: (id: number) => call<Run>(`/cv/score/${id}`),
  history: (filter: { band?: string; cvId?: number } = {}) => {
    const qs = new URLSearchParams();
    if (filter.band) qs.set("band", filter.band);
    if (filter.cvId) qs.set("cvId", String(filter.cvId));
    const q = qs.toString();
    return call<RunSummary[]>(`/cv/score/history${q ? `?${q}` : ""}`);
  },
  removeRun: (id: number) => call<{ ok: boolean }>(`/cv/score/${id}`, "DELETE"),
  makeRewrites: (runId: number) => call<Rewrite[]>(`/cv/score/${runId}/rewrites`, "POST"),
  patchRewrite: (id: number, body: { status?: Rewrite["status"]; proposed?: string }) => call<Rewrite>(`/cv/rewrites/${id}`, "PATCH", body),
  rescore: (runId: number, mode?: Mode) =>
    call<{ id: number; jobId: string | null; cached: boolean; cvVersionId: number }>(
      `/cv/score/${runId}/rescore`,
      "POST",
      mode ? { mode } : {},
    ),
  exportAll: () => call<unknown>("/cv/export"),
  deleteAll: () => call<{ ok: boolean }>("/cv/data", "DELETE"),
  job: (id: string) => call<Job>(`/tasks/${id}`),
  llm: () => call<LlmSettings>("/llm/settings"),
  saveLlm: (provider: string, model: string) => call<LlmSettings>("/llm/settings", "PUT", { provider, model }),
  resetLlm: () => call<LlmSettings>("/llm/settings", "DELETE"),
  testLlm: () => call<{ ok: boolean; reply?: string; error?: string }>("/llm/test", "POST"),
};

export { watchJob } from "../../shared/async";
