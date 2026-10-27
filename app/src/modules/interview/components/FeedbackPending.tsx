import { useState } from "react";
import { useAction, type Job } from "../../../shared/async";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { interviewApi } from "../api";
import { JobProgress } from "./JobProgress";

interface Props {
  sessionId: number;
  jobId: string | null;
  onChange: () => void;
}

/** Waits while the feedback is written. If that failed, or never started, offers to try again. */
export function FeedbackPending({ sessionId, jobId, onChange }: Props) {
  const [failure, setFailure] = useState<string | null>(null);
  const { busy, run } = useAction();

  const finished = (job: Job) => (job.status === "done" ? onChange() : setFailure(job.error ?? "The feedback was not written."));
  const retry = async () => {
    setFailure(null);
    if ((await run(() => interviewApi.end(sessionId))) !== undefined) onChange();
  };

  return (
    <Card title="Marking your answers">
      {failure !== null || jobId === null ? (
        <>
          <p className="iv-warn">{failure ?? "The feedback was not started."}</p>
          <Button variant="primary" disabled={busy} onClick={() => void retry()}>
            Try again
          </Button>
        </>
      ) : (
        <JobProgress key={jobId} jobId={jobId} label="Marking your answers" onDone={finished} />
      )}
    </Card>
  );
}
