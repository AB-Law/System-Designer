import { useCallback, useEffect, useState } from "react";
import { attempt, useAction } from "../../../shared/async";
import { EmptyState } from "../../../ui/EmptyState";
import { hubApi } from "../api";
import { go } from "../route";
import type { Summary } from "../types";
import { RecentActivity, StreakCard } from "./ActivityCards";
import { FitCard } from "./FitCard";
import { NextActions } from "./NextActions";
import { ReadinessGrid } from "./ReadinessGrid";
import { TargetSwitcher } from "./TargetSwitcher";

export function Dashboard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const { busy, run } = useAction();

  const load = useCallback(async () => {
    const s = await attempt(hubApi.summary);
    if (s) setSummary(s);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const switchTo = async (id: number) => {
    if (await run(() => hubApi.setActive(id))) await load();
  };

  if (!summary) return <p className="hub-muted">Loading…</p>;
  const { target } = summary;

  return (
    <div className="hub-stack">
      <header className="hub-head">
        <div>
          <div className="hub-label">Preparing for</div>
          <h2 className="hub-title">
            {target ? target.title : "What are you preparing for?"}
            {target?.company && <span className="hub-muted"> at {target.company}</span>}
          </h2>
        </div>
        <TargetSwitcher targets={summary.targets} active={target} disabled={busy} onSwitch={(id) => void switchTo(id)} />
      </header>

      {!target && (
        <EmptyState
          title="Set a target"
          action={
            <button type="button" className="btn primary" onClick={() => go({ name: "targets" })}>
              Set a target
            </button>
          }
        >
          Add a role and the Hub shows how ready you are for it, and what to do next.
        </EmptyState>
      )}

      <div className="hub-cols">
        <NextActions actions={summary.actions} />
        {summary.modules.includes("cv") && <FitCard fit={summary.fit} target={target} />}
      </div>
      <ReadinessGrid topics={summary.readiness} />
      <div className="hub-cols">
        <RecentActivity items={summary.activity} />
        <StreakCard streak={summary.streak} />
      </div>
    </div>
  );
}
