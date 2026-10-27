import { useEffect, useState } from "react";
import { Badge } from "../../../ui/Badge";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { EmptyState } from "../../../ui/EmptyState";
import { cvApi } from "../api";
import { useAction } from "../hooks";
import { errText } from "../store";
import type { LlmSettings } from "../types";

/** Which AI the CV tools use. API keys stay on the server; you pick among the providers it has set up. */
export function AiSettings() {
  const [s, setS] = useState<LlmSettings | null>(null);
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const { busy, run: act } = useAction();
  const [error, setError] = useState<string | null>(null);

  const apply = (v: LlmSettings) => {
    setS(v);
    const cur = v.current ?? v.effective;
    setProvider(cur.provider);
    setModel(v.current ? v.current.model : "");
  };

  useEffect(() => {
    let dead = false;
    cvApi
      .llm()
      .then((v) => !dead && apply(v))
      .catch((e) => !dead && setError(errText(e)));
    return () => {
      dead = true;
    };
  }, []);

  if (error) return <EmptyState title="Could not load settings">{error}</EmptyState>;
  if (!s) return <EmptyState title="Loading" />;
  const info = s.providers.find((p) => p.id === provider);

  const change = async (fn: () => Promise<LlmSettings>, done: string) => {
    setResult(null);
    const next = await act(fn, done);
    if (next) apply(next);
  };

  const test = async () => {
    setResult(null);
    const r = await act(() => cvApi.testLlm());
    if (r) setResult(r.ok ? { ok: true, text: "Connected. The model answered." } : { ok: false, text: r.error || "No answer." });
  };

  const used = s.usage.quota ? Math.min(100, Math.round((100 * s.usage.monthTokens) / s.usage.quota)) : null;

  return (
    <div className="cv-stack">
      <Card title="AI provider" actions={s.current ? <Badge tone="gold">Your choice</Badge> : <Badge>Server default</Badge>}>
        <p className="cv-hint">
          CV reading, scoring and rewrites send your CV text to this provider. Keys live on the server and are never shown here. A local
          model keeps the text on your machine.
        </p>
        <div className="cv-grid">
          <label className="cv-field">
            <span>Provider</span>
            <select value={provider} onChange={(e) => setProvider(e.target.value)}>
              {s.providers.map((p) => (
                <option key={p.id} value={p.id} disabled={!p.available}>
                  {p.label}
                  {p.available ? "" : " (not set up on this server)"}
                </option>
              ))}
            </select>
          </label>
          <label className="cv-field">
            <span>
              Model {info?.defaultModel ? <small>(blank = {info.defaultModel})</small> : <small>(blank = whichever is loaded)</small>}
            </span>
            <input value={model} onChange={(e) => setModel(e.target.value)} placeholder={info?.defaultModel || "loaded model"} />
          </label>
        </div>
        <div className="cv-row">
          <Button
            variant="primary"
            disabled={busy || !info?.available}
            onClick={() => void change(() => cvApi.saveLlm(provider, model.trim()), "AI settings saved.")}
          >
            Save
          </Button>
          <Button disabled={busy} onClick={() => void test()}>
            Test connection
          </Button>
          {s.current && (
            <Button variant="ghost" disabled={busy} onClick={() => void change(() => cvApi.resetLlm(), "Back to the server default.")}>
              Use the server default
            </Button>
          )}
        </div>
        {result && (
          <p className={result.ok ? "cv-ok" : "cv-warn"} role="status">
            {result.text}
          </p>
        )}
      </Card>
      <Card title="Usage this month">
        <p>
          {s.usage.monthTokens.toLocaleString()} tokens{s.usage.quota ? ` of ${s.usage.quota.toLocaleString()}` : " (no limit set)"}
        </p>
        {used !== null && (
          <div
            className="ui-progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={used}
            aria-label="Monthly AI usage"
          >
            <div style={{ width: `${used}%` }} />
          </div>
        )}
      </Card>
    </div>
  );
}
