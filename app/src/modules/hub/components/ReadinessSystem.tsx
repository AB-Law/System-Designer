import { useState, type CSSProperties } from "react";
import { CountUp } from "../../../ui/CountUp";
import { daysLeftText, TIER_COLOR, TIER_WORD, weekday } from "../format";
import { arcPath, moduleNodes, overall, ringSegments, segmentSpan, weakestLink, type Health, type ModuleNode } from "../systemModel";
import type { Summary } from "../types";
import "../system.css";

interface Pt {
  x: number;
  y: number;
}

const HEALTH_COLOR = (h: Health): string => (h === "quiet" ? "var(--muted)" : TIER_COLOR[h]);
const HEALTH_WORD = (h: Health): string => (h === "quiet" ? "Quiet" : TIER_WORD[h]);

/** The same diagram drawn wide on a desktop and stacked on a phone. Edges leave each module and arrive on the ring. */
function layout(compact: boolean) {
  const mods = compact
    ? { w: 164, h: 62, at: [90, 270, 90, 270].map((x, i) => ({ x, y: i < 2 ? 48 : 122 })) as Pt[] }
    : { w: 244, h: 76, at: [62, 166, 270, 374].map((y) => ({ x: 160, y })) as Pt[] };
  const ring = compact ? { c: { x: 180, y: 336 }, r: 98, sw: 22 } : { c: { x: 640, y: 220 }, r: 138, sw: 28 };
  const day = compact ? { c: { x: 180, y: 580 }, w: 250, h: 80 } : { c: { x: 1075, y: 220 }, w: 200, h: 112 };
  const outer = ring.r + ring.sw / 2 + 4;
  const arrive = (i: number): Pt => {
    // spread the four arrival points over the near side of the ring
    const off = [-0.5, -0.17, 0.17, 0.5][i] * outer;
    const reach = Math.sqrt(outer * outer - off * off);
    return compact ? { x: ring.c.x + off, y: ring.c.y - reach } : { x: ring.c.x - reach, y: ring.c.y + off };
  };
  const curve = (a: Pt, b: Pt) => {
    const mid = compact
      ? { x1: a.x, y1: (a.y + b.y) / 2, x2: b.x, y2: (a.y + b.y) / 2 }
      : { x1: (a.x + b.x) / 2, y1: a.y, x2: (a.x + b.x) / 2, y2: b.y };
    return `M${a.x} ${a.y} C${mid.x1} ${mid.y1} ${mid.x2} ${mid.y2} ${b.x} ${b.y}`;
  };
  const leave = (p: Pt): Pt => (compact ? { x: p.x, y: p.y + mods.h / 2 } : { x: p.x + mods.w / 2, y: p.y });
  const dayFrom = compact ? { x: ring.c.x, y: ring.c.y + outer } : { x: ring.c.x + outer, y: ring.c.y };
  const dayTo = compact ? { x: day.c.x, y: day.c.y - day.h / 2 } : { x: day.c.x - day.w / 2, y: day.c.y };
  return {
    viewBox: compact ? "0 0 360 650" : "0 0 1200 440",
    mods,
    ring,
    day,
    paths: mods.at.map((p, i) => curve(leave(p), arrive(i))),
    dayPath: curve(dayFrom, dayTo),
  };
}

function ModuleCard({ n, p, w, h, compact, weak }: { n: ModuleNode; p: Pt; w: number; h: number; compact: boolean; weak: boolean }) {
  const x = p.x - w / 2;
  const y = p.y - h / 2;
  return (
    <a
      href={n.hash}
      className={`rs-node m-${n.id}${weak ? " weak" : ""}${n.available ? "" : " off"}`}
      aria-label={`${n.label}: ${HEALTH_WORD(n.health)}, ${n.detail}`}
    >
      {weak && <rect className="rs-halo" x={x - 6} y={y - 6} width={w + 12} height={h + 12} rx="16" />}
      <rect className="rs-box" x={x} y={y} width={w} height={h} rx="12" />
      <text className="rs-name" x={x + 16} y={y + (compact ? 25 : 32)}>
        {n.label}
      </text>
      <text className="rs-detail" x={x + 16} y={y + (compact ? 46 : 58)}>
        {n.detail}
      </text>
      <circle cx={x + w - 18} cy={y + (compact ? 20 : 26)} r="5" fill={HEALTH_COLOR(n.health)} />
      {!compact && (
        <text className="rs-health" x={x + w - 32} y={y + 30} textAnchor="end" fill={HEALTH_COLOR(n.health)}>
          {HEALTH_WORD(n.health)}
        </text>
      )}
    </a>
  );
}

/** Modules feed one ring of topic segments, which feeds the interview day. Quiet or weak links show up where they are. */
export function ReadinessSystem({ summary, compact }: { summary: Summary; compact: boolean }) {
  const g = layout(compact);
  const nodes = moduleNodes(summary);
  const weak = weakestLink(nodes);
  const segs = ringSegments(summary.readiness);
  const score = overall(summary);
  const withData = segs.filter((x) => x.strength !== null).length;
  const [hot, setHot] = useState<string | null>(null);
  const hotSeg = segs.find((s) => s.slug === hot) ?? null;
  const days = summary.target?.daysLeft ?? null;
  const dated = days !== null && days >= 0;
  const { c, r, sw } = g.ring;

  return (
    <section className="rs" aria-label="Your readiness system">
      <figure className="rs-fig">
        <svg viewBox={g.viewBox} role="group" aria-label="Design, CV, Interview and Study feed your readiness for the interview day">
          <defs>
            {g.paths.map((d, i) => (
              <path key={nodes[i].id} id={`rs-m-${nodes[i].id}`} d={d} />
            ))}
            <path id="rs-day" d={g.dayPath} />
          </defs>

          {nodes.map((n) => (
            <use key={n.id} href={`#rs-m-${n.id}`} className={`rs-edge${n.week > 0 ? " live" : ""}${weak?.id === n.id ? " weak" : ""}`} />
          ))}
          <use href="#rs-day" className="rs-edge live" />

          {nodes.map((n) =>
            n.week > 0
              ? Array.from({ length: Math.min(4, 1 + n.week) }, (_, i) => (
                  <circle key={`${n.id}-${i}`} r="3.5" className="rs-packet">
                    <animateMotion dur="2.4s" begin={`-${((i / Math.min(4, 1 + n.week)) * 2.4).toFixed(2)}s`} repeatCount="indefinite">
                      <mpath href={`#rs-m-${n.id}`} />
                    </animateMotion>
                  </circle>
                ))
              : null,
          )}
          {score !== null &&
            [0, 1, 2].map((i) => (
              <circle key={`d${i}`} r="3.5" className="rs-packet">
                <animateMotion dur="2s" begin={`-${(i * 2) / 3}s`} repeatCount="indefinite">
                  <mpath href="#rs-day" />
                </animateMotion>
              </circle>
            ))}

          {nodes.map((n, i) => (
            <ModuleCard key={n.id} n={n} p={g.mods.at[i]} w={g.mods.w} h={g.mods.h} compact={compact} weak={weak?.id === n.id} />
          ))}

          <g className="rs-ring">
            {segs.map((s, i) => {
              const span = segmentSpan(i, Math.max(segs.length, 1));
              const filled = s.strength === null ? 0 : s.strength;
              return (
                <g
                  key={s.slug}
                  className={`rs-seg${hot === s.slug ? " hot" : ""}`}
                  tabIndex={0}
                  role="img"
                  aria-label={`${s.label}: ${TIER_WORD[s.tier]}`}
                  style={{ "--i": i } as CSSProperties}
                  onPointerEnter={() => setHot(s.slug)}
                  onPointerLeave={() => setHot(null)}
                  onFocus={() => setHot(s.slug)}
                  onBlur={() => setHot(null)}
                >
                  <path
                    className={"rs-track" + (s.strength === null ? " empty" : "")}
                    d={arcPath(c.x, c.y, r, span.from, span.to)}
                    strokeWidth={sw}
                  />
                  {filled > 0 && (
                    <path
                      className="rs-fill"
                      d={arcPath(c.x, c.y, r, span.from, span.from + (span.to - span.from) * filled)}
                      strokeWidth={sw}
                      stroke={TIER_COLOR[s.tier]}
                      pathLength={1}
                    />
                  )}
                </g>
              );
            })}
            {segs.length === 0 && <circle className="rs-track" cx={c.x} cy={c.y} r={r} strokeWidth={sw} />}
            <text className="rs-score" x={c.x} y={c.y + (compact ? 14 : 22)} textAnchor="middle">
              {hotSeg ? TIER_WORD[hotSeg.tier] : score !== null ? <CountUp value={`${score}%`} ms={1300} /> : "–"}
            </text>
            <text className="rs-cap" x={c.x} y={c.y + (compact ? 42 : 56)} textAnchor="middle">
              {hotSeg ? hotSeg.label : "Readiness"}
            </text>
          </g>

          <a href="#/hub/targets" className="rs-node rs-day">
            <rect className="rs-box" x={g.day.c.x - g.day.w / 2} y={g.day.c.y - g.day.h / 2} width={g.day.w} height={g.day.h} rx="14" />
            <text className="rs-detail" x={g.day.c.x} y={g.day.c.y - g.day.h / 2 + 30} textAnchor="middle">
              Interview day
            </text>
            <text className="rs-dayfig" x={g.day.c.x} y={g.day.c.y + 22} textAnchor="middle">
              {dated ? `${days} ${days === 1 ? "day" : "days"}` : "Set a date"}
            </text>
          </a>
        </svg>
      </figure>

      <div className="rs-foot">
        <p className="rs-weak">
          {weak ? (
            <>
              <b>Weakest link: {weak.label}.</b>{" "}
              {weak.strength !== null ? `${Math.round(weak.strength * 100)}% strength so far. ` : `${weak.detail}. `}
              {dated ? `${daysLeftText(days)}.` : ""}
              {segs.length > 0 && ` ${withData} of ${segs.length} topics have evidence.`}
            </>
          ) : (
            <b>Every part is carrying its weight.</b>
          )}
        </p>
        <div className="rs-streak" title="Consecutive days with some practice">
          <span>
            <b>{summary.streak.days}</b> day streak
          </span>
          <ul aria-label="Last seven days">
            {summary.streak.week.map((d) => (
              <li
                key={d.date}
                className={d.active ? "on" : ""}
                role="img"
                aria-label={`${weekday(d.date)}: ${d.active ? "active" : "no activity"}`}
              />
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
