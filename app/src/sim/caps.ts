import type { Capability, Design, DesignNode, Problem } from "../types";

/** Blocks that may run capabilities. */
export const HOST_BLOCKS = new Set(["server", "service", "websocket", "worker"]);
/** Old saves have no explicit picks; these blocks then serve the primary request. */
const IMPLICIT_HOSTS = new Set(["server", "service", "websocket"]);

export const isBackground = (c: Capability): boolean => c.mode === "background";
export const requestCaps = (list: Capability[]): Capability[] => list.filter((c) => !isBackground(c));

/** The request every design must serve: critical and needed by every request. */
export function primaryCapability(problem: Problem): Capability | undefined {
  const caps = (problem.capabilities ?? []).filter((c) => !isBackground(c));
  return caps.find((c) => c.critical && c.share >= 1) ?? caps[0];
}

/** Capabilities each node runs. Explicit picks win; legacy servers/services run the primary request. */
export function hostedCaps(design: Design, problem: Problem): Map<string, Capability[]> {
  const byId = new Map((problem.capabilities ?? []).map((c) => [c.id, c]));
  const primary = primaryCapability(problem);
  const out = new Map<string, Capability[]>();
  for (const n of design.nodes) out.set(n.id, capsOfNode(n, byId, primary));
  return out;
}

function capsOfNode(n: DesignNode, byId: Map<string, Capability>, primary?: Capability): Capability[] {
  if (n.capabilities === undefined) return primary && IMPLICIT_HOSTS.has(n.blockId) ? [primary] : [];
  return n.capabilities.map((id) => byId.get(id)).filter((c): c is Capability => !!c);
}

/** Largest share among the request capabilities a block runs, or undefined if it runs none. */
export function shareOf(list: Capability[]): number | undefined {
  const r = requestCaps(list);
  return r.length ? Math.max(...r.map((c) => c.share)) : undefined;
}

/** Work one incoming request costs on a block, given what it runs. A dedicated light service is below 1, a monolith above. */
export function workFactor(list: Capability[]): number {
  const r = requestCaps(list);
  if (!r.length) return 1;
  const top = Math.max(...r.map((c) => c.share));
  return Math.max(
    0.05,
    r.reduce((a, c) => a + (c.share / top) * c.work, 0),
  );
}

/** True when a block runs request capabilities and none of them is critical, so callers can fall back without it. */
export function isOptionalHost(list: Capability[]): boolean {
  const r = requestCaps(list);
  return r.length > 0 && r.every((c) => !c.critical);
}

export function hostsByCapability(hosted: Map<string, Capability[]>): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [nodeId, list] of hosted) for (const c of list) out.set(c.id, [...(out.get(c.id) ?? []), nodeId]);
  return out;
}

/** Ids a block runs: its explicit picks, or for old saves the primary request on servers and services. */
export function capIdsOf(blockId: string, picked: string[] | undefined, problem: Problem | undefined): string[] {
  if (picked !== undefined) return picked;
  const primary = problem ? primaryCapability(problem) : undefined;
  return primary && IMPLICIT_HOSTS.has(blockId) ? [primary.id] : [];
}

/** Blocks reachable from a node by following synchronous connections. */
export function reachableNodes(design: Design, fromId: string): DesignNode[] {
  const seen = new Set<string>([fromId]);
  const found: DesignNode[] = [];
  const queue = [fromId];
  while (queue.length) {
    const id = queue.shift()!;
    for (const e of design.edges) {
      if (e.source !== id || e.kind === "async" || seen.has(e.target)) continue;
      seen.add(e.target);
      const t = design.nodes.find((n) => n.id === e.target);
      if (t) found.push(t);
      queue.push(e.target);
    }
  }
  return found;
}

/** Block types reachable from a node by following synchronous connections. */
export function reachableTypes(design: Design, fromId: string): Set<string> {
  return new Set(reachableNodes(design, fromId).map((n) => n.blockId));
}

/** Kinds of external provider. A capability can need any provider ("third_party") or one kind ("third_party:payment"). */
export const PROVIDER_KINDS: Record<string, { id: string; label: string; latencyMs: number; perRps: number }> = {
  Generic: { id: "generic", label: "Generic provider", latencyMs: 120, perRps: 0.05 },
  "Ad network": { id: "ad_network", label: "Ad network", latencyMs: 120, perRps: 0.05 },
  "Payment processor": { id: "payment", label: "Payment processor", latencyMs: 250, perRps: 0.2 },
  "Email / SMS": { id: "messaging", label: "Email / SMS provider", latencyMs: 180, perRps: 0.08 },
  "Maps / geo": { id: "maps", label: "Maps / geo provider", latencyMs: 60, perRps: 0.15 },
};
export const providerKindId = (cfg: { kind?: string }): string => PROVIDER_KINDS[cfg.kind ?? "Generic"]?.id ?? "generic";

/** Human name for a need such as "third_party" or "third_party:payment". */
export function needLabel(need: string): string {
  const [type, kind] = need.split(":");
  const base = type === "third_party" ? "Third-party API" : type;
  const k = kind ? Object.values(PROVIDER_KINDS).find((x) => x.id === kind)?.label : undefined;
  return k ? `${base} set to ${k}` : base;
}

/** What a block needs for the capabilities it runs but is not connected to. */
export function missingNeeds(design: Design, nodeId: string, caps: Capability[]): { cap: Capability; need: string }[] {
  const reach = reachableNodes(design, nodeId);
  const out: { cap: Capability; need: string }[] = [];
  for (const cap of caps)
    for (const need of cap.needs ?? []) {
      const [type, kind] = need.split(":");
      const ok = reach.some((n) => n.blockId === type && (!kind || providerKindId(n.cfg) === kind));
      if (!ok) out.push({ cap, need });
    }
  return out;
}

export const GUARANTEE_LABEL: Record<string, string> = {
  exclusive_access: "exclusive access (locks)",
  idempotent: "idempotent processing",
  ordered_delivery: "ordered delivery",
  replay: "replay of past events",
  transactions: "transactions (all-or-nothing writes)",
  unique_ids: "a way to issue unique ids",
};

/** Guarantees a capability requires that the design does not provide, with a hint on how to fix each. */
export function unmetGuarantees(design: Design, nodeId: string, caps: Capability[]): { cap: Capability; guarantee: string; fix: string }[] {
  const out: { cap: Capability; guarantee: string; fix: string }[] = [];
  const node = design.nodes.find((n) => n.id === nodeId);
  if (!node) return out;
  const reach = reachableNodes(design, nodeId);
  for (const cap of caps) {
    for (const g of cap.requires ?? []) {
      if (g === "exclusive_access") {
        const locked = reach.some(
          (n) =>
            (n.blockId === "database" && n.cfg.consistency && n.cfg.consistency !== "Eventual" && n.cfg.engine !== "Time-series") ||
            (n.blockId === "cache" && n.cfg.lockService),
        );
        if (!locked)
          out.push({
            cap,
            guarantee: g,
            fix: "Set a connected Database to Row locks (or Serializable), or connect a Cache that is turned on as a lock service.",
          });
      } else if (g === "ordered_delivery" || g === "replay") {
        const feeds = design.edges
          .filter((e) => e.target === nodeId)
          .map((e) => design.nodes.find((n) => n.id === e.source))
          .filter((n): n is DesignNode => !!n && n.blockId === "stream");
        const ok = g === "ordered_delivery" ? feeds.length > 0 : feeds.some((n) => Number(n.cfg.retentionH ?? 24) >= 24);
        if (!ok)
          out.push({
            cap,
            guarantee: g,
            fix:
              g === "ordered_delivery"
                ? "Read the messages from a Stream (a Queue does not keep order), with a partition key per conversation."
                : "Read from a Stream that keeps at least 24 hours, so the history can be read again.",
          });
      } else if (g === "idempotent") {
        if (!node.cfg.idempotent && !node.cfg.idempotencyKeys)
          out.push({
            cap,
            guarantee: g,
            fix: "Turn on idempotency keys on the Server or Service (or Idempotent processing on a Worker), so a retry cannot apply it twice.",
          });
      } else if (g === "unique_ids") {
        const strategy = node.cfg.idStrategy ?? "None";
        const locked = reach.some(
          (n) => n.blockId === "database" && n.cfg.consistency && n.cfg.consistency !== "Eventual" && n.cfg.engine !== "Time-series",
        );
        if (strategy === "None")
          out.push({
            cap,
            guarantee: g,
            fix: "Choose an ID strategy on the Server or Service that runs it: random with a collision check, a counter range per server, or a central counter.",
          });
        else if (!locked)
          out.push({
            cap,
            guarantee: g,
            fix: "Every strategy needs a connected Database with locking (Row locks or Serializable) so ranges can be leased, or collisions checked, atomically.",
          });
      } else if (g === "transactions") {
        const ok = reach.some(
          (n) => n.blockId === "database" && n.cfg.consistency === "Serializable" && (!n.cfg.engine || n.cfg.engine === "Relational"),
        );
        if (!ok)
          out.push({
            cap,
            guarantee: g,
            fix: "Connect a Database with the Relational engine and Locking set to Serializable. Key-value, document and time-series engines cannot make several writes atomic.",
          });
      }
    }
  }
  return out;
}
