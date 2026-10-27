import { useCallback, useEffect, useState } from "react";
import { attempt, errText } from "../../../shared/async";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { interviewApi } from "../api";
import { go } from "../route";
import type { SessionDetail } from "../types";
import { Chat } from "./Chat";
import { Feedback } from "./Feedback";
import { FeedbackPending } from "./FeedbackPending";
import { JobProgress } from "./JobProgress";

function Failed({ message, roleId }: { message: string | null; roleId: number }) {
  return (
    <Card title="The interview could not be prepared">
      <p className="iv-warn">{message ?? "Something went wrong."}</p>
      <Button variant="primary" onClick={() => go({ name: "new", roleId })}>
        Start a new one
      </Button>
    </Card>
  );
}

function Body({ detail, reload }: { detail: SessionDetail; reload: () => void }) {
  const end = async () => {
    if (!window.confirm("End the interview now? You will get feedback on what you have answered.")) return;
    if ((await attempt(() => interviewApi.end(detail.id))) !== undefined) reload();
  };

  if (detail.status === "failed") return <Failed message={detail.error} roleId={detail.roleId} />;
  if (detail.status === "planning") {
    return detail.planJobId ? (
      <Card title="Preparing your interview">
        <JobProgress key={detail.planJobId} jobId={detail.planJobId} label="Preparing your interview" onDone={reload} />
      </Card>
    ) : (
      <Failed message="The interview was never queued." roleId={detail.roleId} />
    );
  }
  if (detail.status === "active") return <Chat detail={detail} onEnd={() => void end()} onFinished={reload} />;
  return detail.feedback ? (
    <Feedback detail={detail} feedback={detail.feedback} />
  ) : (
    <FeedbackPending sessionId={detail.id} jobId={detail.feedbackJobId} onChange={reload} />
  );
}

export function SessionPage({ sessionId }: { sessionId: number }) {
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    interviewApi.session(sessionId).then(setDetail, (e: unknown) => setError(errText(e)));
  }, [sessionId]);
  useEffect(reload, [reload]);

  if (error) return <p className="iv-warn">{error}</p>;
  if (!detail) return <p className="iv-hint">Loading…</p>;
  return <Body detail={detail} reload={reload} />;
}
