import { useEffect, useRef, useState, type CSSProperties } from "react";
import { INCIDENT, SERVERS, SPIKE_RPS, servedPercent } from "./landingModel";
import { reducedMotion, useMedia } from "./motionHooks";

const START_AFTER = 1600; // let the headline finish rising first

export interface Incident {
  down: ReadonlySet<string>;
  rps: number;
  log: string;
  live: boolean;
  served: number;
  toggle: (id: string) => void;
}

/** The first eight seconds play on their own; the first click takes over and cancels the rest. */
export function useIncident(): Incident {
  const [state, setState] = useState<{ down: ReadonlySet<string>; rps: number; log: string; live: boolean }>({
    down: new Set(),
    rps: INCIDENT[0].rps ?? 900,
    log: INCIDENT[0].log,
    live: false,
  });
  const touched = useRef(false);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const last = INCIDENT[INCIDENT.length - 1];
    if (reducedMotion()) {
      setState({ down: new Set(), rps: SPIKE_RPS, log: last.log, live: true });
      return;
    }
    INCIDENT.forEach((step, i) => {
      timers.current.push(
        window.setTimeout(() => {
          if (touched.current) return;
          setState((s) => ({
            down: step.down ? new Set(step.down) : s.down,
            rps: step.rps ?? s.rps,
            log: step.log,
            live: i === INCIDENT.length - 1,
          }));
        }, START_AFTER + step.at),
      );
    });
    const pending = timers.current;
    return () => pending.forEach((t) => window.clearTimeout(t));
  }, []);

  const toggle = (id: string) => {
    touched.current = true;
    timers.current.forEach((t) => window.clearTimeout(t));
    setState((s) => {
      const down = new Set(s.down);
      if (down.has(id)) down.delete(id);
      else down.add(id);
      const up = SERVERS.length - down.size;
      const served = servedPercent(up, SPIKE_RPS);
      const log =
        up === 0
          ? "Outage. Nothing can answer."
          : down.size === 0
            ? "All servers are healthy."
            : `${down.size} down. ${served}% of requests are answered.`;
      return { down, rps: SPIKE_RPS, log, live: true };
    });
  };

  const served = servedPercent(SERVERS.length - state.down.size, state.rps);
  return { ...state, served, toggle };
}

interface Pt {
  x: number;
  y: number;
}

/** One layout drawn two ways: a wide strip, and the same system turned on its side for a phone. */
function layout(compact: boolean) {
  const m = (x: number, y: number): Pt => (compact ? { x: y + 30, y: x / 2 } : { x, y });
  const logical = {
    users: [60, 120],
    lb: [330, 120],
    servers: [40, 120, 200].map((y) => [650, y]),
    db: [1060, 120],
  } as const;
  const P = (p: readonly number[]) => m(p[0], p[1]);
  const line = (a: Pt, b: Pt) => `M${a.x} ${a.y} L${b.x} ${b.y}`;
  const curve = (a: readonly number[], b: readonly number[]) => {
    const mx = (a[0] + b[0]) / 2;
    const A = P(a);
    const B = P(b);
    const C1 = m(mx, a[1]);
    const C2 = m(mx, b[1]);
    return `M${A.x} ${A.y} C${C1.x} ${C1.y} ${C2.x} ${C2.y} ${B.x} ${B.y}`;
  };
  return {
    viewBox: compact ? "0 0 300 600" : "0 0 1200 240",
    users: P(logical.users),
    lb: P(logical.lb),
    servers: logical.servers.map(P),
    db: P(logical.db),
    paths: {
      ul: line(P(logical.users), P(logical.lb)),
      ls: logical.servers.map((s) => curve(logical.lb, s)),
      sd: logical.servers.map((s) => curve(s, logical.db)),
    },
    size: compact ? { r: 24, lb: [76, 44], srv: [78, 40], db: [88, 56] } : { r: 34, lb: [96, 64], srv: [150, 52], db: [110, 72] },
  };
}

function Packets({ id, n, dur }: { id: string; n: number; dur: number }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <circle key={`${id}-${n}-${dur}-${i}`} r="4" className="sys-packet">
          <animateMotion dur={`${dur}s`} begin={`-${((i / n) * dur).toFixed(2)}s`} repeatCount="indefinite">
            <mpath href={`#${id}`} />
          </animateMotion>
        </circle>
      ))}
    </>
  );
}

/** Six gold dots that trail the pointer across the diagram, each a little slower than the one before. */
function useCursorTrail(box: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = box.current;
    if (!el || reducedMotion() || !window.matchMedia("(pointer: fine)").matches) return;
    const dots = Array.from(el.querySelectorAll<HTMLElement>(".trail-dot"));
    const target = { x: 0, y: 0 };
    const pos = dots.map(() => ({ x: 0, y: 0 }));
    let raf = 0;
    let inside = false;
    const loop = () => {
      dots.forEach((d, i) => {
        const k = 0.34 - i * 0.045;
        pos[i].x += ((i === 0 ? target.x : pos[i - 1].x) - pos[i].x) * k;
        pos[i].y += ((i === 0 ? target.y : pos[i - 1].y) - pos[i].y) * k;
        d.style.transform = `translate(${pos[i].x}px, ${pos[i].y}px)`;
      });
      raf = requestAnimationFrame(loop);
    };
    const enter = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      target.x = e.clientX - r.left;
      target.y = e.clientY - r.top;
      if (!inside) {
        inside = true;
        pos.forEach((p) => Object.assign(p, target));
        el.classList.add("trailing");
        raf = requestAnimationFrame(loop);
      }
    };
    const leave = () => {
      inside = false;
      el.classList.remove("trailing");
      cancelAnimationFrame(raf);
    };
    el.addEventListener("pointermove", enter);
    el.addEventListener("pointerleave", leave);
    return () => {
      el.removeEventListener("pointermove", enter);
      el.removeEventListener("pointerleave", leave);
      cancelAnimationFrame(raf);
    };
  }, [box]);
}

/** Users, a balancer, three servers and a database, with the incident's log and figures above it. */
export function HeroSystem({ sys }: { sys: Incident }) {
  const compact = useMedia("(max-width: 900px)");
  const g = layout(compact);
  const box = useRef<HTMLElement | null>(null);
  useCursorTrail(box);
  const [touched, setTouched] = useState(false);
  const hot = sys.rps >= 3000;
  const n = hot ? 6 : 2;
  const dur = hot ? 1.1 : 2.6;
  const outage = sys.served === 0;

  const rect = (c: Pt, [w, h]: readonly number[]) => ({ x: c.x - w / 2, y: c.y - h / 2, width: w, height: h });

  return (
    <figure
      className={`sys${outage ? " sys-out" : ""}`}
      data-ui
      ref={box as React.RefObject<HTMLElement>}
      aria-label="Interactive system diagram"
    >
      <div className="sys-read">
        <p className="sys-log" role="status">
          {sys.log}
        </p>
        <p className="sys-nums">
          <span>
            <b>{sys.rps.toLocaleString("en-US")}</b> requests a second
          </span>
          <span>
            <b>{sys.served}%</b> answered
          </span>
        </p>
      </div>
      <svg viewBox={g.viewBox} role="group" aria-label="Users, a load balancer, three servers and a database">
        <defs>
          <path id="p-ul" d={g.paths.ul} />
          {g.paths.ls.map((d, i) => (
            <path key={i} id={`p-l${i}`} d={d} />
          ))}
          {g.paths.sd.map((d, i) => (
            <path key={i} id={`p-s${i}`} d={d} />
          ))}
        </defs>

        <use href="#p-ul" className="sys-edge sys-live" style={{ "--s": `${dur}s` } as CSSProperties} />
        {SERVERS.map((id, i) => {
          const dead = sys.down.has(id);
          return (
            <g key={id}>
              <use href={`#p-l${i}`} className={`sys-edge ${dead ? "sys-dead" : "sys-live"}`} />
              <use href={`#p-s${i}`} className={`sys-edge ${dead ? "sys-dead" : "sys-live"}`} />
            </g>
          );
        })}

        <Packets id="p-ul" n={n} dur={dur} />
        {SERVERS.map((id, i) =>
          sys.down.has(id) ? null : (
            <g key={id}>
              <Packets id={`p-l${i}`} n={n} dur={dur} />
              <Packets id={`p-s${i}`} n={n} dur={dur} />
            </g>
          ),
        )}

        <g className="sys-node">
          <circle cx={g.users.x} cy={g.users.y} r={g.size.r} />
          <text x={g.users.x} y={g.users.y + 4} textAnchor="middle">
            Users
          </text>
        </g>
        <g className="sys-node sys-lb">
          <rect {...rect(g.lb, g.size.lb)} rx="10" />
          <text x={g.lb.x} y={g.lb.y + 4} textAnchor="middle">
            Balancer
          </text>
        </g>
        {SERVERS.map((id, i) => {
          const dead = sys.down.has(id);
          const c = g.servers[i];
          const label = `Server ${id.toUpperCase()}`;
          return (
            <g
              key={id}
              className={`sys-node sys-srv${dead ? " sys-bad" : ""}`}
              role="button"
              tabIndex={0}
              aria-pressed={dead}
              aria-label={`${label}, ${dead ? "down, press to restore" : "up, press to break"}`}
              onClick={() => {
                setTouched(true);
                sys.toggle(id);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setTouched(true);
                  sys.toggle(id);
                }
              }}
            >
              <rect {...rect(c, g.size.srv)} rx="10" />
              <text x={c.x} y={c.y + 4} textAnchor="middle">
                {dead ? `${label} down` : label}
              </text>
            </g>
          );
        })}
        <g className={`sys-node sys-db${outage ? " sys-bad" : ""}`}>
          <rect {...rect(g.db, g.size.db)} rx="10" />
          <text x={g.db.x} y={g.db.y + 4} textAnchor="middle">
            Database
          </text>
        </g>
      </svg>
      <p className="sys-hint">{sys.live || touched ? "Click a server to break it or fix it." : "Watch what a spike does."}</p>
      {Array.from({ length: 6 }, (_, i) => (
        <i key={i} className="trail-dot" aria-hidden="true" />
      ))}
    </figure>
  );
}
