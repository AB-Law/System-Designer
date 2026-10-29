import { useCallback, useEffect, useState } from "react";
import { attempt, useAction } from "../../../shared/async";
import { EmptyState } from "../../../ui/EmptyState";
import { hubApi } from "../api";
import { go } from "../route";
import type { Summary } from "../types";
import { RecentActivity } from "./ActivityCards";
import { FitCard } from "./FitCard";
import { useMedia } from "../../../components/home/motionHooks";
import { NextMove } from "./HubHero";
import { ReadinessSystem } from "./ReadinessSystem";
import { ReadinessGrid } from "./ReadinessGrid";
import { ResumeCard } from "./ResumeCard";
import { SetupCard } from "./SetupCard";
import { TargetSwitcher } from "./TargetSwitcher";

export function Dashboard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const { busy, run } = useAction();
  const compact = useMedia("(max-width: 760px)");

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

      <ReadinessSystem summary={summary} compact={compact} />

      <div className="hub-board">
        <div className="hub-span-7">
          <NextMove summary={summary} />
        </div>
        <div className="hub-span-5">{summary.modules.includes("cv") && <FitCard fit={summary.fit} target={target} />}</div>
        <div className="hub-span-12">
          <ReadinessGrid topics={summary.readiness} track={summary.track} modules={summary.modules} />
        </div>
        <div className="hub-span-6 hub-cell">
          <ResumeCard activity={summary.activity} />
        </div>
        <div className="hub-span-6 hub-cell">
          <RecentActivity items={summary.activity} />
        </div>
      </div>
    </div>
  );
}
