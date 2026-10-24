import type { ComponentType } from "react";
import { CacheDemo } from "./CacheDemo";
import { CopiesDemo } from "./CopiesDemo";
import { EdgeDemo } from "./EdgeDemo";
import { OneServerDemo } from "./OneServerDemo";
import { COPIES, EDGE, ONE_SERVER, copies, edgeOrigin, oneServer } from "./analyzeModels";
import { CACHE_DEMO, cacheOutcome } from "./cacheModel";

const n = (x: number) => Math.round(x).toLocaleString("en-GB");
const cacheBefore = cacheOutcome(CACHE_DEMO.before);
const cacheAfter = cacheOutcome(CACHE_DEMO.after);
const pct = (x: number) => `${Math.round(x * 100)}%`;
const busyDay = oneServer(ONE_SERVER.busyRps, ONE_SERVER.capacity);
const threeCopies = copies(3);
const timetable = edgeOrigin(0.9);

export interface DemoDef {
  title: string;
  /** which kind of model the demo uses, shown to the learner */
  model: "teaching" | "analyze";
  /** the demo in words, for the printed and read-as-one-page versions of a lesson */
  text: string;
  Component: ComponentType;
}

/** Every demo a lesson can name with `::: demo <id>`. Add new demos here; content validation checks lessons against these ids. */
export const DEMOS: Record<string, DemoDef> = {
  "d1-cache": {
    title: "Predict the database load",
    model: "teaching",
    text: `Teaching model. A page gets ${n(CACHE_DEMO.readsPerSec)} reads a second. With a ${CACHE_DEMO.before * 100}% hit ratio the cache lets ${n(cacheBefore.dbReadsPerSec)} reads a second through to the database. If the hit ratio drops to ${CACHE_DEMO.after * 100}%, ${n(cacheAfter.dbReadsPerSec)} reads a second get through: ${n(cacheAfter.dbReadsPerSec / cacheBefore.dbReadsPerSec)} times the load, and more than the database (assumed to answer ${n(CACHE_DEMO.dbReadsPerSec)} reads a second) can serve. The numbers are invented; the model has no keys, expiry or hot items, and assumes every request is a read.`,
    Component: CacheDemo,
  },
  "d0-one-server": {
    title: "What happens when one server is full?",
    model: "analyze",
    text: `Uses the app's simulator. A bakery's order page runs on one server that handles ${n(ONE_SERVER.capacity)} requests a second. On a normal day ${n(ONE_SERVER.quietRps)} arrive and all are served. On a busy Saturday ${n(ONE_SERVER.busyRps)} arrive, so ${pct(busyDay.served)} are served and the rest are not. The numbers are invented; there is one server and it does not scale itself up.`,
    Component: OneServerDemo,
  },
  "d0-copies": {
    title: "What do extra copies buy you?",
    model: "analyze",
    text: `Uses the app's simulator. The bakery runs 3 copies of its server behind a load balancer, each handling ${n(COPIES.capacityEach)} requests a second, with ${n(COPIES.rps)} arriving. If one copy fails, two remain and handle ${n(2 * COPIES.capacityEach)}, so ${pct(threeCopies.oneDown.served)} of requests are still served. A single copy that fails leaves nothing standing. Each copy adds to the monthly cost. The numbers are invented; copies are identical and keep no shared state.`,
    Component: CopiesDemo,
  },
  "d0-edge-origin": {
    title: "How much does a CDN take off the origin?",
    model: "analyze",
    text: `Uses the app's simulator. ${n(EDGE.rps)} requests a second arrive for a school timetable PDF and the origin, which is blob storage, answers ${n(EDGE.originCapacity)}. Without a CDN ${pct(timetable.withoutCdn.served)} are served. With a CDN answering 90% at the edge, ${n(timetable.withCdn.reaching)} requests a second reach the origin and all are served, at some extra monthly cost. The numbers are invented; every request is a read, and the model never loses a file.`,
    Component: EdgeDemo,
  },
};

export const DEMO_IDS = Object.keys(DEMOS);
