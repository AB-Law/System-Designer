/** Clamp to 0..100 so a bad value never draws outside the track. */
export const pct = (v: number): number => (Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : 0);

/** `busy` adds a moving shimmer, for a step that is working but has nothing new to report. */
export function ProgressBar({ value, label, busy = false }: { value: number; label?: string; busy?: boolean }) {
  const p = pct(value);
  return (
    <div
      className={"ui-progress" + (busy ? " busy" : "")}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={p}
      aria-label={label}
    >
      <div style={{ width: `${p}%` }} />
    </div>
  );
}
