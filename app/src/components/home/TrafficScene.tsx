import { sceneFrame, type Level } from "./landingModel";
import { useMedia, useScrollProgress } from "./motionHooks";

interface Pt {
  x: number;
  y: number;
}

/** The same design laid out wide for a desktop and turned on its side for a phone. */
function layout(compact: boolean) {
  const m = (x: number, y: number): Pt => (compact ? { x: y * 0.62 + 12, y: x / 2 } : { x, y });
  const P = (p: readonly number[]) => m(p[0], p[1]);
  const at = {
    users: [60, 220],
    cache: [340, 220],
    servers: [90, 220, 350].map((y) => [640, y]),
    db: [990, 140],
    queue: [990, 330],
  } as const;
  const curve = (a: readonly number[], b: readonly number[]) => {
    const mx = (a[0] + b[0]) / 2;
    const A = P(a);
    const B = P(b);
    const C1 = m(mx, a[1]);
    const C2 = m(mx, b[1]);
    return `M${A.x} ${A.y} C${C1.x} ${C1.y} ${C2.x} ${C2.y} ${B.x} ${B.y}`;
  };
  const edges = [
    { id: "t-uc", d: `M${P(at.users).x} ${P(at.users).y} L${P(at.cache).x} ${P(at.cache).y}`, to: "cache" as const },
    ...at.servers.map((s, i) => ({ id: `t-cs${i}`, d: curve(at.cache, s), to: "servers" as const })),
    ...at.servers.map((s, i) => ({ id: `t-sd${i}`, d: curve(s, at.db), to: "db" as const })),
    ...at.servers.map((s, i) => ({ id: `t-sq${i}`, d: curve(s, at.queue), to: "queue" as const })),
  ];
  return {
    viewBox: compact ? "0 0 286 600" : "0 0 1200 440",
    users: P(at.users),
    cache: P(at.cache),
    servers: at.servers.map(P),
    db: P(at.db),
    queue: P(at.queue),
    edges,
    dims: compact
      ? { r: 24, cache: [72, 46], srv: [70, 46], db: [84, 50], queue: [84, 50] }
      : { r: 34, cache: [128, 64], srv: [140, 60], db: [136, 76], queue: [136, 64] },
  };
}

const NOTE: Record<Level, string> = { ok: "healthy", warn: "filling", bad: "full" };
const SERVER_NOTE: Record<Level, string> = { ok: "healthy", warn: "busy", bad: "saturated" };

/**
 * A pinned scene: the page stops and scrolling raises the load on one design from 100 to 1,000,000 requests a second.
 * The cache fills first, then the servers, the database and finally the queue, and a caption names whichever is failing.
 */
export function TrafficScene({ onTry }: { onTry: () => void }) {
  const [ref, p] = useScrollProgress<HTMLElement>();
  const compact = useMedia("(max-width: 900px)");
  const g = layout(compact);
  const s = sceneFrame(p);
  const rps = s.rps;
  const exp = Math.log10(rps) - 2; // 0..4
  const n = 1 + Math.floor(exp * 1.25);
  const dur = Math.max(0.5, 2.8 - exp * 0.55);

  const rect = (c: Pt, [w, h]: readonly number[]) => ({ x: c.x - w / 2, y: c.y - h / 2, width: w, height: h });
  const levelOf = (to: "cache" | "servers" | "db" | "queue"): Level => s[to];
  const qd = g.dims.queue;

  return (
    <section className="lp-scene" ref={ref} aria-labelledby="scene-h">
      <div className="scene-pin">
        <div className="scene-top">
          <h2 id="scene-h">Now scroll. Watch the load grow.</h2>
          <p className="scene-rps" aria-live="off">
            <b>{rps.toLocaleString("en-US")}</b>
            <span>requests a second</span>
          </p>
        </div>

        <figure className="scene-fig" data-ui aria-label="One design under growing load">
          <svg viewBox={g.viewBox} role="group" aria-label="Users, a cache, three servers, a database and a queue">
            <defs>
              {g.edges.map((e) => (
                <path key={e.id} id={e.id} d={e.d} />
              ))}
            </defs>
            {g.edges.map((e) => (
              <use key={e.id} href={`#${e.id}`} className={`sys-edge ${levelOf(e.to) === "bad" ? "sys-dead" : "sys-live"}`} />
            ))}
            {g.edges.map((e) =>
              Array.from({ length: n }, (_, i) => (
                <circle key={`${e.id}-${n}-${i}`} r="3.5" className={`sys-packet${levelOf(e.to) === "bad" ? " lost" : ""}`}>
                  <animateMotion dur={`${dur}s`} begin={`-${((i / n) * dur).toFixed(2)}s`} repeatCount="indefinite">
                    <mpath href={`#${e.id}`} />
                  </animateMotion>
                </circle>
              )),
            )}

            <g className="sys-node">
              <circle cx={g.users.x} cy={g.users.y} r={g.dims.r} />
              <text x={g.users.x} y={g.users.y + 4} textAnchor="middle">
                Users
              </text>
            </g>
            <g className={`sys-node lv-${s.cache}`}>
              <rect {...rect(g.cache, g.dims.cache)} rx="10" />
              <text x={g.cache.x} y={g.cache.y - 3} textAnchor="middle">
                Cache
              </text>
              <text x={g.cache.x} y={g.cache.y + 14} textAnchor="middle" className="note">
                {s.fixes >= 1 ? "absorbing reads" : NOTE[s.cache]}
              </text>
            </g>
            {g.servers.map((c, i) => (
              <g key={i} className={`sys-node lv-${s.servers}`}>
                <rect {...rect(c, g.dims.srv)} rx="10" />
                <text x={c.x} y={c.y - 3} textAnchor="middle">
                  Server {"ABC"[i]}
                </text>
                <text x={c.x} y={c.y + 14} textAnchor="middle" className="note">
                  {s.fixes >= 2 ? "scaled out" : SERVER_NOTE[s.servers]}
                </text>
              </g>
            ))}
            <g className={`sys-node lv-${s.db}`}>
              <rect {...rect(g.db, g.dims.db)} rx="10" />
              <text x={g.db.x} y={g.db.y - 3} textAnchor="middle">
                Database
              </text>
              <text x={g.db.x} y={g.db.y + 16} textAnchor="middle" className="note">
                {s.fixes >= 3 ? "replicas, shards" : s.db === "ok" ? "healthy" : s.db === "warn" ? "busy" : "saturated"}
              </text>
            </g>
            <g className={`sys-node lv-${s.queue}`}>
              <rect {...rect(g.queue, qd)} rx="10" />
              <rect
                className="backlog"
                x={g.queue.x - qd[0] / 2 + 6}
                y={g.queue.y + qd[1] / 2 - 12}
                width={Math.max(0, (qd[0] - 12) * s.backlog)}
                height="6"
                rx="3"
              />
              <text x={g.queue.x} y={g.queue.y - 6} textAnchor="middle">
                Queue
              </text>
              <text x={g.queue.x} y={g.queue.y + 8} textAnchor="middle" className="note">
                {s.fixes >= 4 ? "draining" : s.queue === "ok" ? "empty" : s.queue === "warn" ? "growing" : "backed up"}
              </text>
            </g>
          </svg>
        </figure>

        <div className="scene-foot">
          <p className="scene-caption" role="status">
            {s.caption}
          </p>
          {s.fixes === 4 && (
            <button type="button" className="btn primary lg scene-try" onClick={onTry}>
              Build this yourself
            </button>
          )}
        </div>
        <p className="scene-hint" aria-hidden={p > 0.02}>
          Keep scrolling
        </p>
      </div>
    </section>
  );
}
