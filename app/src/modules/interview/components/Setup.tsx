import { useEffect, useState } from "react";
import { attempt, useAction } from "../../../shared/async";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { interviewApi } from "../api";
import { DEFAULT_STYLE, MAX_QUESTIONS, totalQuestions } from "../format";
import { go } from "../route";
import type { RoleSummary, ScoreRunOption } from "../types";
import { draftProblem, emptyDraft, type RoleDraft } from "../draft";
import { featureOn } from "../../../shell/registry";
import { Budget } from "./Budget";
import { Research } from "./Research";
import { RoleFields } from "./RoleFields";
import { StyleFields } from "./StyleFields";

const RESEARCH = "interview.research";

function roleInput(d: RoleDraft) {
  return {
    title: d.title.trim(),
    level: d.level,
    company: d.company.trim() || null,
    jdText: d.jdText.trim() || null,
    scoreRunId: d.scoreRunId,
  };
}

export function Setup({ roleId, scoreRunId }: { roleId: number | null; scoreRunId?: number }) {
  const [roles, setRoles] = useState<RoleSummary[] | null>(null);
  const [runs, setRuns] = useState<ScoreRunOption[]>([]);
  const [draft, setDraft] = useState<RoleDraft>({ ...emptyDraft(roleId ?? "new"), scoreRunId: scoreRunId ?? null });
  const [style, setStyle] = useState(DEFAULT_STYLE);
  const { busy, run } = useAction();
  const researchOn = featureOn(RESEARCH);

  useEffect(() => {
    void (async () => {
      const [r, s] = await Promise.all([attempt(interviewApi.roles), interviewApi.scoreRuns()]);
      setRoles(r ?? []);
      setRuns(s);
    })();
  }, []);

  const chosen = roles?.find((r) => r.id === draft.roleId);
  const problem = draftProblem(draft) ?? (totalQuestions(style) > MAX_QUESTIONS ? "Too many questions." : null);

  const start = () =>
    run(async () => {
      const role = draft.roleId === "new" ? await interviewApi.createRole(roleInput(draft)) : { id: draft.roleId };
      const session = await interviewApi.startSession(role.id, style);
      go({ name: "session", sessionId: session.id });
    });

  if (!roles) return <p className="iv-hint">Loading…</p>;
  return (
    <div className="iv-stack">
      <Card title="New practice interview">
        <div className="iv-stack">
          <RoleFields draft={draft} roles={roles} runs={runs} onChange={setDraft} />
          <StyleFields
            style={style}
            hasCompany={draft.roleId === "new" ? !!draft.company.trim() || draft.scoreRunId !== null : !!chosen?.company}
            onChange={setStyle}
          />
          <Budget />
          {problem && <p className="iv-warn">{problem}</p>}
          <div className="iv-row">
            <Button variant="primary" disabled={busy || !!problem} onClick={() => void start()}>
              {busy ? "Preparing…" : "Start interview"}
            </Button>
          </div>
        </div>
      </Card>
      {researchOn && draft.roleId !== "new" && <Research roleId={draft.roleId} />}
    </div>
  );
}
