import type { ReactNode } from "react";
import { CountUp } from "./CountUp";

export interface Stat {
  label: string;
  value: string;
  unit?: string;
  caption: string;
  /** The one figure that takes the data hue; the rest stay ink. */
  hero?: boolean;
  /** An action sitting in the tile, for the tile whose figure asks for one. */
  action?: ReactNode;
}

/** A row of plain counts: a label, a figure in the display face, one caption. Colour goes on one figure only. */
export function StatTiles({ tiles, label }: { tiles: Stat[]; label: string }) {
  return (
    <section className="ui-stats" aria-label={label}>
      {tiles.map((t) => (
        <div key={t.label} className={"ui-stat" + (t.hero ? " hero" : "")}>
          <span className="ui-stat-label">{t.label}</span>
          <span className="ui-stat-value">
            <CountUp value={t.value} />
            {t.unit && <small>{t.unit}</small>}
          </span>
          <span className="ui-stat-caption">{t.caption}</span>
          {t.action}
        </div>
      ))}
    </section>
  );
}
