import { modelOf } from "../../blocks";

/*
  Teaching model for the cache demo. It is deliberately tiny: reads arrive at a fixed rate, the cache answers the share that hit,
  and the rest go to the database. The miss share comes from the app's own Cache block (`modelOf`), so the demo and the canvas
  use one rule. The numbers below are invented for the lesson, not measurements.
*/
export const CACHE_DEMO = {
  /** reads per second arriving at the cache */
  readsPerSec: 10000,
  /** reads per second the database can answer (an invented figure) */
  dbReadsPerSec: 2000,
  /** the two hit ratios the lesson compares */
  before: 0.9,
  after: 0.5,
};

export interface CacheOutcome {
  /** hit ratio actually used (the app's Cache block caps it at 98%) */
  hitRatio: number;
  /** share of reads that miss and go on to the database */
  missShare: number;
  /** reads per second the database receives */
  dbReadsPerSec: number;
  /** database load as a share of what it can answer; above 1 it cannot keep up */
  dbUtilisation: number;
  overloaded: boolean;
}

export function cacheOutcome(hitRatio: number, readsPerSec = CACHE_DEMO.readsPerSec, dbCapacity = CACHE_DEMO.dbReadsPerSec): CacheOutcome {
  const cache = modelOf("cache", { hitRatio });
  const used = Math.min(0.98, Math.max(0, hitRatio));
  const db = readsPerSec * cache.passThrough;
  return { hitRatio: used, missShare: cache.passThrough, dbReadsPerSec: db, dbUtilisation: db / dbCapacity, overloaded: db > dbCapacity };
}

/** How many times more database load the second outcome carries than the first. */
export const loadMultiple = (from: CacheOutcome, to: CacheOutcome): number => to.dbReadsPerSec / from.dbReadsPerSec;
