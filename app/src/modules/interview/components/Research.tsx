import { useEffect, useState } from "react";
import { attempt, useAction, type Job } from "../../../shared/async";
import { Badge } from "../../../ui/Badge";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { EmptyState } from "../../../ui/EmptyState";
import { interviewApi } from "../api";
import { ageLabel } from "../format";
import { CATEGORIES, CATEGORY_LABELS, type Bank, type BankItem, type Category, type ResearchResult } from "../types";
import { JobProgress } from "./JobProgress";

const SKIPPED: Record<NonNullable<ResearchResult["skipped"]>, string> = {
  no_search: "Web search is not available right now (no key, or this month's allowance is used), so these are questions already saved.",
  no_results: "The search found no usable questions this time.",
};

function QuestionRow({ item, busy, onRemove, onFlag }: { item: BankItem; busy: boolean; onRemove: () => void; onFlag: () => void }) {
  return (
    <li className="iv-doc">
      <div className="iv-doc-head">
        <div className="iv-stack" style={{ gap: 4 }}>
          <strong>{item.question}</strong>
          <span className="iv-hint">
            {item.sourceUrl ? (
              <>
                <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">
                  {item.sourceName || item.sourceUrl}
                </a>
                {" · found "}
                {ageLabel(item.fetched)}
              </>
            ) : (
              "Added by you"
            )}
          </span>
        </div>
        <div className="iv-row">
          <Badge>{CATEGORY_LABELS[item.category]}</Badge>
          <Button variant="ghost" disabled={busy} onClick={onRemove}>
            Remove
          </Button>
          {item.storeId !== null && (
            <Button variant="ghost" disabled={busy} onClick={onFlag}>
              Report
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

/** Questions researched on the web for a saved role, with where each came from. The interviewer draws on this list when it plans. */
export function Research({ roleId }: { roleId: number }) {
  const [bank, setBank] = useState<Bank | null | undefined>(undefined);
  const [note, setNote] = useState("");
  const [text, setText] = useState("");
  const [category, setCategory] = useState<Category>("technical");
  const { busy, run } = useAction();

  const reload = async () => {
    const rows = await attempt(() => interviewApi.banks(roleId));
    setBank(rows?.[0] ?? null);
  };

  useEffect(() => {
    let live = true; // a role picked in the meantime must not be overwritten by a slow answer
    setBank(undefined);
    setNote("");
    void attempt(() => interviewApi.banks(roleId)).then((rows) => {
      if (live) setBank(rows?.[0] ?? null);
    });
    return () => {
      live = false;
    };
  }, [roleId]);

  const find = () =>
    run(async () => {
      const started = await interviewApi.startResearch(roleId);
      setNote(started.searchConfigured ? "" : SKIPPED.no_search);
      await reload();
    });

  const onJobDone = (job: Job) => {
    const result = job.result as ResearchResult | null | undefined;
    if (job.status === "done" && result?.skipped) setNote(SKIPPED[result.skipped]);
    void reload();
  };

  const change = (body: Parameters<typeof interviewApi.patchBank>[1], done?: string) =>
    run(async () => {
      if (!bank) return;
      setBank(await interviewApi.patchBank(bank.id, body));
    }, done);

  const flag = (item: BankItem) => {
    if (item.storeId === null || !window.confirm("Report this question? It is hidden for everyone until it is reviewed.")) return;
    void run(async () => {
      await interviewApi.flagQuestion(item.storeId!);
      await interviewApi.patchBank(bank!.id, { remove: [item.ref] });
      await reload();
    }, "Reported and hidden.");
  };

  const add = () => {
    const question = text.trim();
    if (question.length < 8) return;
    void change({ add: [{ question, category }] }).then(() => setText(""));
  };

  if (bank === undefined) return <p className="iv-hint">Loading…</p>;
  const running = bank?.status === "running" && !!bank.jobId;

  return (
    <Card title="Researched questions">
      <div className="iv-stack">
        <p className="iv-hint">
          Searches the web for real interview questions for this kind of role and company, and keeps the link to each. Your CV and job
          description are not sent anywhere. The interviewer uses this list when it plans your next interview.
        </p>
        <div className="iv-row">
          <Button variant="primary" disabled={busy || running} onClick={() => void find()}>
            {bank ? "Search again" : "Find questions"}
          </Button>
        </div>
        {running && <JobProgress key={bank!.jobId} jobId={bank!.jobId!} label="Researching questions" onDone={onJobDone} />}
        {note && <p className="iv-hint">{note}</p>}
        {bank?.status === "failed" && bank.error && <p className="iv-warn">{bank.error}</p>}
        {bank && bank.items.length === 0 && !running ? (
          <EmptyState title="No questions yet">Search for some, or add your own below.</EmptyState>
        ) : (
          bank && (
            <ul className="iv-doc-list">
              {bank.items.map((item) => (
                <QuestionRow
                  key={item.ref}
                  item={item}
                  busy={busy}
                  onRemove={() => void change({ remove: [item.ref] })}
                  onFlag={() => flag(item)}
                />
              ))}
            </ul>
          )
        )}
        {bank && (
          <div className="iv-grid">
            <label className="iv-field">
              <span>Add your own question</span>
              <input value={text} maxLength={300} onChange={(e) => setText(e.target.value)} />
            </label>
            <label className="iv-field">
              <span>Kind</span>
              <select value={category} onChange={(e) => setCategory(e.target.value as Category)}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </label>
            <div className="iv-row">
              <Button disabled={busy || text.trim().length < 8} onClick={add}>
                Add
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
