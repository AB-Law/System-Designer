import { pct } from "./ProgressBar";

/** Under 50 is weak, under 75 fair, otherwise strong. */
export const ringTone = (v: number): "bad" | "warn" | "good" => (pct(v) < 50 ? "bad" : pct(v) < 75 ? "warn" : "good");

export function ScoreRing({ value, size = 72, label }: { value: number; size?: number; label?: string }) {
  const p = pct(value);
  const r = 15.9155; // circumference 100, so the dash length is the percentage
  return (
    <div
      className={"ui-ring " + ringTone(p)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${label ?? "Score"} ${p} out of 100`}
    >
      <svg viewBox="0 0 36 36" aria-hidden="true">
        <circle className="ui-ring-track" cx="18" cy="18" r={r} />
        <circle className="ui-ring-fill" cx="18" cy="18" r={r} strokeDasharray={`${p} 100`} />
      </svg>
      <b>{p}</b>
    </div>
  );
}
