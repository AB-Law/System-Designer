import { useCallback, useEffect, useState } from "react";
import { attempt, useAction } from "../../../shared/async";
import { EmptyState } from "../../../ui/EmptyState";
import { hubApi } from "../api";
import { go } from "../route";
import type { Summary } from "../types";
import { RecentActivity, StreakChip } from "./ActivityCards";
import { FitCard } from "./FitCard";
import { HubTiles, NextMove } from "./HubHero";
import { ModuleCards } from "./ModuleCards";
import { NextActions } from "./NextActions";
import { ReadinessGrid } from "./ReadinessGrid";
import { ResumeCard } from "./ResumeCard";
import { SetupCard } from "./SetupCard";
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

  if (!summary)
    return (
      <div className="hub-skel" role="status" aria-label="Loading">
        <i style={{ height: 200 }} />
        <i />
        <i />
      </div>
    );
  const { target } = summary;

  return (
    <div className="hub-stack">
      <header className="hub-head">
        <div>
          <div className="hub-label">Preparing for</div>
          <h1 className="hub-title">{target ? target.title : "What are you preparing for?"}</h1>
          {target?.company && <p className="hub-company">at {target.company}</p>}
        </div>
        <div className="hub-head-side">
          <StreakChip streak={summary.streak} />
          <TargetSwitcher targets={summary.targets} active={target} disabled={busy} onSwitch={(id) => void switchTo(id)} />
        </div>
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

      <SetupCard steps={summary.setup} onChange={() => void load()} />
      <HubTiles summary={summary} />

      <div className="hub-board">
        <div className="hub-span-8">
          <NextMove summary={summary} />
        </div>
        <div className="hub-span-4">{summary.modules.includes("cv") && <FitCard fit={summary.fit} target={target} />}</div>
        <div className="hub-span-7">
          <NextActions actions={summary.actions} />
        </div>
        <div className="hub-span-5 hub-side">
          <ResumeCard activity={summary.activity} />
          <RecentActivity items={summary.activity} />
        </div>
        <div className="hub-span-12">
          <ReadinessGrid topics={summary.readiness} track={summary.track} modules={summary.modules} />
        </div>
        <div className="hub-span-12">
          <ModuleCards />
        </div>
      </div>
    </div>
  );
}
