import { useCallback, useState } from "react";
import { ApiError, call } from "../api";
import { toast } from "../ui/Toast";

/** Helpers every feature module uses to call the backend and follow its background jobs. */

export interface Job {
  id: string;
  status: "queued" | "running" | "done" | "failed" | "cancelled";
  progress: number;
  message: string;
  error: string | null;
}

export const errText = (e: unknown): string => (e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong.");

/** Run an API call. A failure becomes a toast and `undefined`; `done` is shown as a success toast. */
export async function attempt<T>(fn: () => Promise<T>, done?: string): Promise<T | undefined> {
  try {
    const result = await fn();
    if (done) toast(done, "good");
    return result;
  } catch (e) {
    toast(errText(e), "bad");
    return undefined;
  }
}

/** `attempt` that also says whether a call is in flight, so a button can disable itself. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const run = useCallback(async <T>(fn: () => Promise<T>, done?: string): Promise<T | undefined> => {
    setBusy(true);
    try {
      return await attempt(fn, done);
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, run };
}

const FINAL = new Set(["done", "failed", "cancelled"]);

/** Follow a background job until it ends. Polls the status endpoint (the server also offers SSE at /api/tasks/{id}/events). */
export function watchJob(jobId: string, onUpdate: (j: Job) => void, intervalMs = 700): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const tick = async () => {
    if (stopped) return;
    try {
      const j = await call<Job>(`/tasks/${jobId}`);
      if (stopped) return;
      onUpdate(j);
      if (FINAL.has(j.status)) return;
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return;
    }
    timer = setTimeout(() => void tick(), intervalMs);
  };
  void tick();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
