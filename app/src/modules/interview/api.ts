import { ApiError, call, postBinary } from "../../api";
import { parseSse } from "./sse";
import type {
  Bank,
  Category,
  ResearchStart,
  Usage,
  DocChunk,
  DocScope,
  DocSummary,
  RoleInput,
  RoleSummary,
  ScoreRunOption,
  SessionDetail,
  SessionSummary,
  StreamEvent,
  Style,
} from "./types";

export const interviewApi = {
  roles: () => call<RoleSummary[]>("/interview/roles"),
  createRole: (body: RoleInput) => call<RoleSummary>("/interview/roles", "POST", body),
  removeRole: (id: number) => call<{ ok: boolean }>(`/interview/roles/${id}`, "DELETE"),
  sessions: () => call<SessionSummary[]>("/interview/sessions"),
  session: (id: number) => call<SessionDetail>(`/interview/sessions/${id}`),
  startSession: (roleId: number, style: Style) => call<{ id: number; jobId: string }>("/interview/sessions", "POST", { roleId, style }),
  end: (id: number) => call<{ jobId: string }>(`/interview/sessions/${id}/end`, "POST"),
  removeSession: (id: number) => call<{ ok: boolean }>(`/interview/sessions/${id}`, "DELETE"),
  /** Turn a short recording into text. Audio is not stored. Requires `interview.voice`. */
  transcribe: (sessionId: number, blob: Blob) =>
    postBinary<{ text: string }>(`/interview/sessions/${sessionId}/transcribe`, {}, blob, 60000),
  docs: (roleId?: number) => call<DocSummary[]>(`/interview/docs${roleId != null ? `?role_id=${roleId}` : ""}`),
  uploadDoc: (file: File, scope: DocScope, roleId: number | null) =>
    postBinary<DocSummary>(
      "/interview/docs",
      {
        name: file.name,
        scope,
        ...(scope === "role" && roleId != null ? { roleId: String(roleId) } : {}),
      },
      file,
    ),
  uploadJd: (file: File) => postBinary<{ text: string }>("/interview/jd/upload", { name: file.name }, file),
  exportAll: () => call<unknown>("/interview/export"),
  deleteAll: () => call<{ ok: boolean }>("/interview/data", "DELETE"),
  /** This month's AI use against the monthly allowance (shared by every module). */
  usage: async () => (await call<{ usage: Usage }>("/llm/settings")).usage,
  docChunks: (id: number) => call<DocChunk[]>(`/interview/docs/${id}/chunks`),
  removeDoc: (id: number) => call<{ ok: boolean }>(`/interview/docs/${id}`, "DELETE"),
  /** Question research. All of these need the `interview.research` flag on the server. */
  banks: (roleId: number) => call<Bank[]>(`/interview/banks?role_id=${roleId}`),
  startResearch: (roleId: number) => call<ResearchStart>("/interview/research", "POST", { roleId }),
  patchBank: (id: number, body: { remove?: string[]; add?: { question: string; category: Category }[] }) =>
    call<Bank>(`/interview/banks/${id}`, "PATCH", body),
  flagQuestion: (storeId: number) => call<{ ok: boolean }>(`/interview/research/items/${storeId}/flag`, "POST"),
  /** Finished CV scores a role can start from. Empty when the CV module is off. */
  scoreRuns: async (): Promise<ScoreRunOption[]> => {
    try {
      const runs = await call<(ScoreRunOption & { status: string })[]>("/cv/score/history");
      return runs.filter((r) => r.status === "done");
    } catch {
      return [];
    }
  },
};

export { watchJob } from "../../shared/async";

async function failure(r: Response): Promise<ApiError> {
  let message = r.statusText || "Something went wrong";
  try {
    const j = (await r.json()) as { detail?: unknown };
    if (typeof j.detail === "string") message = j.detail;
  } catch {
    /* not JSON */
  }
  return new ApiError(r.status, message);
}

/**
 * Send an answer (or, with `text` null, ask for the reply the interviewer still owes) and hand each streamed event to `onEvent`.
 * Resolves when the stream ends; rejects with an ApiError if the request itself is refused.
 */
export async function streamTurn(
  sessionId: number,
  text: string | null,
  onEvent: (e: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  let r: Response;
  try {
    r = await fetch(`/api/interview/sessions/${sessionId}/turn`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(text === null ? {} : { text }),
      signal,
    });
  } catch {
    throw new ApiError(0, "Could not reach the server.");
  }
  if (!r.ok || !r.body) throw await failure(r);
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    const parsed = parseSse(buffer + decoder.decode(value, { stream: true }));
    buffer = parsed.rest;
    parsed.events.forEach(onEvent);
  }
}
