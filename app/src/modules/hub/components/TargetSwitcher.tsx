import { go } from "../route";
import { daysLeftText } from "../format";
import type { ActiveTarget, Target } from "../types";

/** Pick which role the Hub is shown for. The list is the user's own targets; "Manage" opens the page to add, edit or delete. */
export function TargetSwitcher({
  targets,
  active,
  disabled,
  onSwitch,
}: {
  targets: Target[];
  active: ActiveTarget | null;
  disabled: boolean;
  onSwitch: (id: number) => void;
}) {
  return (
    <div className="hub-switch">
      {targets.length > 1 && (
        <label className="hub-switch-pick">
          <span>Preparing for</span>
          <select value={active?.id ?? ""} disabled={disabled} onChange={(e) => onSwitch(Number(e.target.value))}>
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
                {t.company ? ` at ${t.company}` : ""}
              </option>
            ))}
          </select>
        </label>
      )}
      {active?.date && (
        <span className="hub-muted">
          Interview {active.date}
          {active.daysLeft !== null ? ` · ${daysLeftText(active.daysLeft)}` : ""}
        </span>
      )}
      <button type="button" className="hub-link" onClick={() => go({ name: "targets" })}>
        {targets.length ? "Manage targets" : "Add a target"}
      </button>
    </div>
  );
}
