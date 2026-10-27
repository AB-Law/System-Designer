import type { ReactNode, SyntheticEvent } from "react";
import { lookupTerm } from "../../roadmap";

/** Pins the tooltip to the viewport so a scrolling or clipped panel cannot cut it off. */
function placeTip(e: SyntheticEvent<HTMLElement>) {
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  const w = Math.min(260, window.innerWidth * 0.7, window.innerWidth - 16);
  el.style.setProperty("--tip-left", `${Math.max(8, Math.min(r.left, window.innerWidth - w - 8))}px`);
  el.style.setProperty("--tip-bottom", `${window.innerHeight - r.top + 6}px`);
}

/**
 * Renders plain text with optional [[term]] or [[term|label]] markers as
 * dotted-underline words with a hover/focus tooltip of the glossary definition.
 */
export function GlossText({ text }: { text: string }) {
  const parts = splitGloss(text);
  return (
    <>
      {parts.map((p, i) =>
        p.kind === "text" ? (
          <span key={i}>{p.value}</span>
        ) : (
          <abbr
            key={i}
            className="gloss-term"
            data-tip={p.plain}
            aria-label={`${p.label}: ${p.plain}`}
            tabIndex={0}
            onMouseEnter={placeTip}
            onFocus={placeTip}
          >
            {p.label}
          </abbr>
        ),
      )}
    </>
  );
}

/** Words in plain problem text that get a glossary tooltip (first use only), as [pattern, glossary term]. */
const AUTO_TERMS: [RegExp, string][] = [
  [/p99(-style)? latency|p99/i, "p99 latency"],
  [/\bregions?\b/i, "region"],
  [/\bshard(s|ed|ing)?\b/i, "shard"],
  [/\blatency\b/i, "latency"],
  [/\breplicas?\b/i, "replica"],
  [/\bcache\b/i, "cache"],
  [/\bqueue\b/i, "queue"],
  [/\bidempotent\b/i, "idempotent"],
  [/\brate limit(s|ing)?\b/i, "rate limit"],
  [/\bfan-out\b/i, "fan-out"],
  [/\bhot key\b/i, "hot key"],
  [/\bload balancer\b/i, "load balancer"],
  [/\bautoscal(e|ing)\b/i, "autoscaling"],
];

/**
 * Returns a function that adds glossary tooltips to plain text. Each term is explained
 * once per call to `glosser()`, so a whole panel is not covered in dotted underlines.
 */
export function glosser() {
  const seen = new Set<string>();
  return (text: string) => {
    const marks: { start: number; end: number; key: string }[] = [];
    for (const [re, key] of AUTO_TERMS) {
      if (seen.has(key)) continue;
      const m = re.exec(text);
      if (!m || marks.some((x) => m.index < x.end && m.index + m[0].length > x.start)) continue;
      marks.push({ start: m.index, end: m.index + m[0].length, key });
      seen.add(key);
    }
    if (!marks.length) return text;
    marks.sort((a, b) => a.start - b.start);
    const out: ReactNode[] = [];
    let last = 0;
    marks.forEach((x, i) => {
      const plain = lookupTerm(x.key)?.plain ?? "";
      if (x.start > last) out.push(text.slice(last, x.start));
      out.push(
        <abbr
          key={i}
          className="gloss-term"
          data-tip={plain}
          aria-label={`${text.slice(x.start, x.end)}: ${plain}`}
          tabIndex={0}
          onMouseEnter={placeTip}
          onFocus={placeTip}
        >
          {text.slice(x.start, x.end)}
        </abbr>,
      );
      last = x.end;
    });
    if (last < text.length) out.push(text.slice(last));
    return <>{out}</>;
  };
}

type Part = { kind: "text"; value: string } | { kind: "term"; label: string; plain: string };

function splitGloss(text: string): Part[] {
  const re = /\[\[([^\]]+)\]\]/g;
  const out: Part[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ kind: "text", value: text.slice(last, m.index) });
    const inner = m[1];
    const pipe = inner.indexOf("|");
    const key = (pipe >= 0 ? inner.slice(0, pipe) : inner).trim();
    const label = (pipe >= 0 ? inner.slice(pipe + 1) : inner).trim();
    const entry = lookupTerm(key);
    if (entry) {
      out.push({ kind: "term", label, plain: entry.plain });
    } else {
      out.push({ kind: "text", value: label });
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ kind: "text", value: text.slice(last) });
  return out.length ? out : [{ kind: "text", value: text }];
}
