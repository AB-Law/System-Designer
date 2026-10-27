import { featureOn } from "./registry";

/** True when the Hub module is built in. With it on, the Hub is the home of a signed-in user. */
export const hubOn = (): boolean => featureOn("hub");

export function goHub(): void {
  if (hubOn()) window.location.hash = "#/hub";
}
