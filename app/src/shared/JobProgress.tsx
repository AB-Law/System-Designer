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
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(
    () =>
      watchJob(jobId, (j) => {
        setJob(j);
        if (ENDED.has(j.status)) done.current(j);
      }),
    [jobId],
  );

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
      <p>{job?.message || label}</p>
      <ProgressBar value={(job?.progress ?? 0) * 100} label={label} />
      {canCancel && (
        <button type="button" className="ui-job-cancel" disabled={cancelling} onClick={() => void cancel()}>
          {cancelling ? "Cancelling…" : "Cancel"}
        </button>
      )}
    </div>
  );
}
