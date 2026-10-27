import type { ReactNode } from "react";

export type Tone = "neutral" | "good" | "warn" | "bad" | "gold";

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={"ui-badge " + tone}>{children}</span>;
}
