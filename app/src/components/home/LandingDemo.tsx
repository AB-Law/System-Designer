import { useEffect, useState } from "react";

const SERVERS = [
  { id: "a", label: "Server A", y: 60 },
  { id: "b", label: "Server B", y: 150 },
  { id: "c", label: "Server C", y: 240 },
];
const LB = { x: 150, y: 150 };
const SRV_X = 320;

/**
 * A tiny playable system for the landing hero: users, a load balancer, three servers and a database.
 * Click a server to break it and watch traffic reroute; break all three to see an outage.
 * Plain SVG and CSS, no images or libraries, so it costs almost nothing to load.
 */
export function LandingDemo() {
  const [down, setDown] = useState<ReadonlySet<string>>(new Set());
  const [touched, setTouched] = useState(false);

  // Until the visitor interacts, break and heal Server B once so they see what the page is about.
  useEffect(() => {
    if (touched || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t1 = setTimeout(() => setDown(new Set(["b"])), 2600);
    const t2 = setTimeout(() => setDown(new Set()), 5600);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [touched]);

  const toggle = (id: string) => {
    setTouched(true);
    setDown((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const up = SERVERS.length - down.size;
  const outage = up === 0;
  const served = Math.round((up / SERVERS.length) * 100);
  const status = outage
    ? "Outage. Nothing can serve requests."
    : down.size
      ? `${down.size} down. Traffic rerouted to ${up}.`
      : "All healthy. Traffic is balanced.";

  return (
    <figure className={`ld${outage ? " ld-out" : ""}`} aria-label="Interactive system diagram">
      <svg viewBox="0 0 560 300" role="group" aria-label="Users, load balancer, three servers and a database">
        {/* edges */}
        <path className="ld-edge ld-flow" d={`M70 150 H${LB.x - 36}`} />
        {SERVERS.map((s) => (
          <g key={s.id}>
            <path
              className={`ld-edge ${down.has(s.id) ? "ld-dead" : "ld-flow"}`}
              d={`M${LB.x + 36} ${LB.y} C 250 ${LB.y}, 250 ${s.y}, ${SRV_X - 56} ${s.y}`}
            />
            <path
              className={`ld-edge ${down.has(s.id) ? "ld-dead" : "ld-flow ld-slow"}`}
              d={`M${SRV_X + 56} ${s.y} C 440 ${s.y}, 440 150, 480 150`}
            />
          </g>
        ))}

        {/* users */}
        <g className="ld-node">
          <circle cx="40" cy="150" r="30" />
          <text x="40" y="154" textAnchor="middle">
            Users
          </text>
        </g>

        {/* load balancer */}
        <g className="ld-node ld-lb">
          <rect x={LB.x - 36} y={LB.y - 26} width="72" height="52" rx="10" />
          <text x={LB.x} y={LB.y + 4} textAnchor="middle">
            Balancer
          </text>
        </g>

        {/* servers: real buttons, so they work from the keyboard too */}
        {SERVERS.map((s) => {
          const dead = down.has(s.id);
          return (
            <g
              key={s.id}
              className={`ld-node ld-srv${dead ? " ld-bad" : ""}`}
              role="button"
              tabIndex={0}
              aria-pressed={dead}
              aria-label={`${s.label}, ${dead ? "down, press to restore" : "up, press to break"}`}
              onClick={() => toggle(s.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggle(s.id);
                }
              }}
            >
              <rect x={SRV_X - 56} y={s.y - 24} width="112" height="48" rx="10" />
              <text x={SRV_X} y={s.y + 4} textAnchor="middle">
                {dead ? `${s.label} ✕` : s.label}
              </text>
            </g>
          );
        })}

        {/* database */}
        <g className={`ld-node ld-db${outage ? " ld-bad" : ""}`}>
          <rect x="480" y="122" width="72" height="56" rx="10" />
          <text x="516" y="154" textAnchor="middle">
            Database
          </text>
        </g>
      </svg>

      <figcaption className="ld-cap">
        <span className="ld-meter" aria-hidden="true">
          <i style={{ width: `${served}%` }} />
        </span>
        <span className="ld-num">{served}%</span>
        <span className="ld-status" role="status">
          {status}
        </span>
        <span className="ld-hint">{touched ? "Click a server to break or fix it." : "Try it: click a server to break it."}</span>
      </figcaption>
    </figure>
  );
}
