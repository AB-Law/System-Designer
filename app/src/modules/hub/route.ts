/** Routes inside `#/hub`. Pure parse/format pair; unknown paths land on the dashboard. */
export type HubRoute = { name: "home" } | { name: "targets" };

export function parse(rest: string): HubRoute {
  const parts = rest.split("/").filter(Boolean);
  return parts.length === 1 && parts[0] === "targets" ? { name: "targets" } : { name: "home" };
}

export const format = (r: HubRoute): string => (r.name === "targets" ? "targets" : "");

export const hashFor = (r: HubRoute): string => {
  const rest = format(r);
  return rest ? `#/hub/${rest}` : "#/hub";
};

export const go = (r: HubRoute): void => {
  window.location.hash = hashFor(r);
};
