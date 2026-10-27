import { useEffect, useRef, useState } from "react";
import { watchJob, type Job } from "../../../shared/async";
import { ProgressBar } from "../../../ui/ProgressBar";

const ENDED = new Set<Job["status"]>(["done", "failed", "cancelled"]);

/** Follows one background job and shows its progress. `onDone` is called once, when the job ends, whatever the outcome. */
export function JobProgress({ jobId, label, onDone }: { jobId: string; label: string; onDone: (job: Job) => void }) {
  const [job, setJob] = useState<Job | null>(null);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone; // the latest callback, without restarting the watch when the parent re-renders
  });
  useEffect(
    () =>
      watchJob(jobId, (j) => {
        setJob(j);
        if (ENDED.has(j.status)) done.current(j);
      }),
    [jobId],
  );
  return (
    <div className="iv-wait" role="status">
      <p>{job?.message || label}</p>
      <ProgressBar value={(job?.progress ?? 0) * 100} label={label} />
    </div>
  );
}
