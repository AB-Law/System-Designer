import { useEffect, useRef, useState } from "react";
import { call } from "../api";
import { ProgressBar } from "../ui/ProgressBar";
import { watchJob, type Job } from "./async";

const ENDED = new Set<Job["status"]>(["done", "failed", "cancelled"]);

/**
 * Follows one background job and shows its progress.
 * `onDone` runs once when the job ends. Optional cancel posts to `/tasks/{id}/cancel`.
 */
export function JobProgress({
  jobId,
  label,
  onDone,
  cancellable = false,
}: {
  jobId: string;
  label: string;
  onDone: (job: Job) => void;
  cancellable?: boolean;
}) {
  const [job, setJob] = useState<Job | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const started = useRef(Date.now());
  const moved = useRef({ at: Date.now(), progress: -1 });
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(
    () =>
      watchJob(jobId, (j) => {
        if (j.progress !== moved.current.progress) moved.current = { at: Date.now(), progress: j.progress };
        setJob(j);
        if (ENDED.has(j.status)) done.current(j);
      }),
    [jobId],
  );

  const running = !!job && !ENDED.has(job.status);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);
  const seconds = Math.max(0, Math.round((now - started.current) / 1000));
  const waiting = running && now - moved.current.at > 3000; // an AI step is working but has nothing new to report

  const canCancel = cancellable && job && !ENDED.has(job.status);
  const cancel = async () => {
    if (!canCancel || cancelling) return;
    setCancelling(true);
    try {
      await call(`/tasks/${jobId}/cancel`, "POST");
    } catch {
      setCancelling(false);
    }
  };

  return (
    <div className="ui-job-progress" role="status">
      <p>
        {job?.message || label}
        {running && seconds >= 3 && <span className="ui-job-time"> · {seconds}s</span>}
      </p>
      <ProgressBar value={(job?.progress ?? 0) * 100} label={label} busy={waiting} />
      {waiting && <p className="ui-job-wait">Still working. AI steps can take up to a minute with nothing new to show.</p>}
      {canCancel && (
        <button type="button" className="ui-job-cancel" disabled={cancelling} onClick={() => void cancel()}>
          {cancelling ? "Cancelling…" : "Cancel"}
        </button>
      )}
    </div>
  );
}
