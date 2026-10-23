import { useEffect, useRef, useState, type ReactNode } from "react";
import { describeChange } from "../../ai/chat";
import { toDesign, useProblem, useStore } from "../../store";

/** Very small formatter: paragraphs, "- " bullets and **bold**. */
function Text({ text }: { text: string }) {
  const bold = (line: string) =>
    line
      .split(/(\*\*[^*]+\*\*)/g)
      .map((part, i) => (part.startsWith("**") && part.endsWith("**") ? <b key={i}>{part.slice(2, -2)}</b> : <span key={i}>{part}</span>));
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length) {
      blocks.push(
        <ul key={blocks.length}>
          {bullets.map((b, i) => (
            <li key={i}>{bold(b)}</li>
          ))}
        </ul>,
      );
      bullets = [];
    }
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (/^[-*] /.test(line)) bullets.push(line.slice(2));
    else {
      flush();
      if (line) blocks.push(<p key={blocks.length}>{bold(line)}</p>);
    }
  }
  flush();
  return <>{blocks}</>;
}

const STARTERS = [
  "Where should I start?",
  "Why is my design failing?",
  "What would you improve first?",
  "Explain this problem in simple terms",
];

export function ChatDock() {
  const open = useStore((s) => s.chatOpen);
  const setOpen = useStore((s) => s.setChatOpen);
  const chat = useStore((s) => s.chat);
  const busy = useStore((s) => s.chatBusy);
  const send = useStore((s) => s.sendChat);
  const apply = useStore((s) => s.applyChat);
  const dismiss = useStore((s) => s.dismissChat);
  const clear = useStore((s) => s.clearChat);
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const problem = useProblem();
  const [draft, setDraft] = useState("");
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [chat, busy, open]);

  if (!open)
    return (
      <button className="chat-fab" onClick={() => setOpen(true)} title="Ask the coach about this problem and your canvas">
        <span>?</span> Ask the coach
      </button>
    );

  const design = toDesign(nodes, edges);
  const submit = () => {
    const t = draft;
    setDraft("");
    void send(t);
  };

  return (
    <div className="chat" role="dialog" aria-label="Ask the coach">
      <div className="chat-head">
        <div>
          <b>Ask the coach</b>
          <small>{problem ? problem.title : ""}</small>
        </div>
        <div className="chat-tools">
          {chat.length > 0 && (
            <button className="link" onClick={clear} title="Clear this conversation">
              Clear
            </button>
          )}
          <button className="chat-x" onClick={() => setOpen(false)} aria-label="Close chat">
            ×
          </button>
        </div>
      </div>
      <div className="chat-body">
        {chat.length === 0 && (
          <div className="chat-empty">
            <p>
              I can see the problem and your canvas. I will coach you with hints rather than hand over the answer, and I will never change
              your canvas without you pressing Apply.
            </p>
            <div className="chat-starters">
              {STARTERS.map((s) => (
                <button key={s} onClick={() => void send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {chat.map((m, i) => (
          <div key={i} className={"msg " + m.role}>
            <Text text={m.content} />
            {m.changes && (
              <div className={"proposal " + (m.status ?? "")}>
                <small>The coach suggests</small>
                <ul>
                  {m.changes.map((c, j) => (
                    <li key={j}>{m.summary?.[j] ?? describeChange(c, design, m.changes!)}</li>
                  ))}
                </ul>
                {m.status === "pending" ? (
                  <div className="proposal-actions">
                    <button className="btn small primary" onClick={() => apply(i)}>
                      Apply to my canvas
                    </button>
                    <button className="btn small ghost" onClick={() => dismiss(i)}>
                      Not now
                    </button>
                  </div>
                ) : (
                  <small className="proposal-state">{m.status === "applied" ? "Applied. Ctrl+Z undoes it." : "Dismissed."}</small>
                )}
              </div>
            )}
          </div>
        ))}
        {busy && <div className="msg assistant typing">Thinking…</div>}
        <div ref={end} />
      </div>
      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <textarea
          id="chat-draft"
          value={draft}
          rows={2}
          placeholder="Ask about a concept, a setting, or why something fails…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button className="btn primary" type="submit" disabled={busy || !draft.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
