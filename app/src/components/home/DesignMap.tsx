import { useId, type CSSProperties } from "react";
import { BLOCK_MAP } from "../../blocks";
import { FRAMES, place, type MapData, type MapEdge } from "./designMapModel";

/**
 * A design drawn as a map of its blocks and connections. The hero draws it large with labels, traffic and failures; the problem
 * cards draw the person's own design small, and only show traffic while the card is hovered.
 */
export function DesignMap({
  data,
  variant,
  bad,
  packets = false,
  draw = false,
  label,
}: {
  data: MapData;
  variant: keyof typeof FRAMES;
  /** ids of blocks to show as failing */
  bad?: ReadonlySet<string>;
  packets?: boolean;
  draw?: boolean;
  label: string;
}) {
  const f = FRAMES[variant];
  const uid = useId().replace(/:/g, "");
  const at = place(data.nodes, f);
  const big = variant === "hero";
  const edges = data.edges.filter((e) => at.has(e.source) && at.has(e.target));
  const path = (e: MapEdge) => {
    const a = at.get(e.source)!;
    const b = at.get(e.target)!;
    const mx = (a.x + b.x) / 2;
    return `M${a.x.toFixed(1)} ${a.y.toFixed(1)} C${mx.toFixed(1)} ${a.y.toFixed(1)} ${mx.toFixed(1)} ${b.y.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
  };

  return (
    <svg className={`dm dm-${variant}${draw ? " dm-draw" : ""}`} viewBox={`0 0 ${f.w} ${f.h}`} role="img" aria-label={label}>
      <defs>
        {edges.map((e) => (
          <path key={e.id} id={`${uid}-${e.id}`} d={path(e)} />
        ))}
      </defs>
      {edges.map((e, i) => {
        const dead = bad?.has(e.source) || bad?.has(e.target);
        return (
          <use
            key={e.id}
            href={`#${uid}-${e.id}`}
            className={`dm-edge${e.kind === "async" ? " async" : ""}${dead ? " dead" : ""}`}
            style={{ "--i": i } as CSSProperties}
          />
        );
      })}
      {packets &&
        edges.map((e) =>
          bad?.has(e.source) || bad?.has(e.target)
            ? null
            : [0, 1, 2].map((k) => (
                <circle key={`${e.id}-${k}`} r={big ? 4 : 2.5} className="dm-packet">
                  <animateMotion dur="1.8s" begin={`-${(k * 0.6).toFixed(1)}s`} repeatCount="indefinite">
                    <mpath href={`#${uid}-${e.id}`} />
                  </animateMotion>
                </circle>
              )),
        )}
      {data.nodes.map((n, i) => {
        const p = at.get(n.id);
        const def = BLOCK_MAP[n.blockId];
        if (!p) return null;
        const failing = bad?.has(n.id);
        return (
          <g key={n.id} className={`dm-node${failing ? " bad" : ""}`} style={{ "--i": i } as CSSProperties}>
            <rect
              x={p.x - f.nw / 2}
              y={p.y - f.nh / 2}
              width={f.nw}
              height={f.nh}
              rx={big ? 10 : 4}
              style={{ fill: failing ? undefined : def?.color }}
            />
            {big && (
              <text x={p.x} y={p.y + 5} textAnchor="middle">
                {def?.label ?? n.blockId}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
