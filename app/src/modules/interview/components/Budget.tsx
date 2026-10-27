import { useEffect, useState } from "react";
import { ProgressBar } from "../../../ui/ProgressBar";
import { interviewApi } from "../api";
import type { Usage } from "../types";

/** How much of this month's AI allowance is used. Interviews, scoring and documents all draw on it. */
export function Budget() {
  const [usage, setUsage] = useState<Usage | null>(null);
  useEffect(() => {
    interviewApi.usage().then(setUsage, () => setUsage(null)); // a missing figure is not worth an error
  }, []);
  if (!usage) return null;
  const share = usage.quota ? (100 * usage.monthTokens) / usage.quota : 0;
  return (
    <div className="iv-budget">
      <small>
        AI use this month: {usage.monthTokens.toLocaleString()} tokens
        {usage.quota ? ` of ${usage.quota.toLocaleString()}` : " (no limit set)"}
        {usage.quota > 0 && share >= 80 ? ". An interview uses roughly 30,000 to 60,000." : ""}
      </small>
      {usage.quota > 0 && <ProgressBar value={share} label="Monthly AI usage" />}
    </div>
  );
}
