import { useState } from "react";
import { DEFAULT_OPENAI_MODEL, presetFor, type AiSettings } from "../../ai/review";
import { useStore } from "../../store";

export function AiSettingsModal() {
  const ai = useStore((s) => s.ai);
  const setAi = useStore((s) => s.setAi);
  const setAiOpen = useStore((s) => s.setAiOpen);
  const [draft, setDraft] = useState<AiSettings>(ai);
  const close = () => setAiOpen(false);
  const patch = (p: Partial<AiSettings>) => setDraft({ ...draft, ...p });

  return (
    <div className="overlay" onClick={close}>
      <div className="modal narrow" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="AI settings">
        <button className="x" onClick={close} aria-label="Close">
          ×
        </button>
        <h3 className="m-h">AI review</h3>
        <div className="m-body">
          <div className="col">
            <label>Provider</label>
            <select value={draft.provider} onChange={(e) => setDraft(presetFor(e.target.value as AiSettings["provider"], draft))}>
              <option value="off">Off (rule-based analysis only)</option>
              <option value="lmstudio">LM Studio (local, free)</option>
              <option value="openai">OpenAI</option>
            </select>
          </div>
          {draft.provider !== "off" && (
            <>
              <div className="col">
                <label>Base URL</label>
                <input value={draft.baseUrl} onChange={(e) => patch({ baseUrl: e.target.value })} />
              </div>
              <div className="col">
                <label>Model {draft.provider === "lmstudio" && <small>(blank = whichever model is loaded)</small>}</label>
                <input
                  value={draft.model}
                  placeholder={draft.provider === "openai" ? DEFAULT_OPENAI_MODEL : "loaded model"}
                  onChange={(e) => patch({ model: e.target.value })}
                />
              </div>
              {draft.provider === "lmstudio" && (
                <div className="col">
                  <label>
                    Thinking <small>(reasoning models such as Qwen3)</small>
                  </label>
                  <select value={draft.thinking} onChange={(e) => patch({ thinking: e.target.value as AiSettings["thinking"] })}>
                    <option value="off">Off (fastest, recommended: the prompt already holds the simulator's numbers)</option>
                    <option value="low">Low (a reasoning model may still think for a minute or more)</option>
                    <option value="default">Model default (slowest)</option>
                  </select>
                </div>
              )}
              {draft.provider === "openai" && (
                <div className="col">
                  <label>API key</label>
                  <input
                    type="password"
                    value={draft.apiKey}
                    placeholder="sk-…"
                    onChange={(e) => patch({ apiKey: e.target.value })}
                    autoComplete="off"
                  />
                  <small className="muted">
                    Stays in this tab&apos;s memory only — never written to disk, and never sent to our server. Requests go straight to
                    api.openai.com (check the Network tab). Leave blank only if the backend has OPENAI_API_KEY set for signed-in use.
                  </small>
                </div>
              )}
              {draft.provider === "lmstudio" && (
                <small className="muted">
                  In LM Studio, start the local server and enable CORS (Developer tab) so the browser can call it, or run the FastAPI
                  backend which proxies the call.
                </small>
              )}
            </>
          )}
        </div>
        <div className="m-foot">
          <button className="btn ghost" onClick={close}>
            Cancel
          </button>
          <button
            className="btn primary"
            onClick={() => {
              setAi(draft);
              close();
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
