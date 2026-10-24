import type { ComponentType } from "react";
import { CacheDemo } from "./CacheDemo";
import { CACHE_DEMO, cacheOutcome } from "./cacheModel";

const n = (x: number) => Math.round(x).toLocaleString("en-GB");
const cacheBefore = cacheOutcome(CACHE_DEMO.before);
const cacheAfter = cacheOutcome(CACHE_DEMO.after);

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
};

export const DEMO_IDS = Object.keys(DEMOS);
