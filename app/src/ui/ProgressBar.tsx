/** Clamp to 0..100 so a bad value never draws outside the track. */
export const pct = (v: number): number => (Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : 0);

export function ProgressBar({ value, label }: { value: number; label?: string }) {
  const p = pct(value);
  return (
    <div className="ui-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p} aria-label={label}>
      <div style={{ width: `${p}%` }} />
    </div>
  );
}
