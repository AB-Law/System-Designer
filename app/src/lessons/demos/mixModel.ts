import { modelOf } from "../../blocks";

/*
  Teaching model for the read/write mix demo. A store has one limit for reads and a lower one for writes, and the most it can take
  in total depends on the mix. The combination rule is the app's own database block (`modelOf`), so the demo and the canvas agree.
  The figures are invented for the lesson: a database that answers 2,000 reads a second but only 400 writes a second (the app's
  database gets there with a capacity of 400 per node and four read copies, which is not something this lesson explains yet).
*/
export const MIX_DEMO = {
  /** requests a second the page receives */
  requestsPerSec: 1000,
  readLimit: 2000,
  writeLimit: 400,
  recipeWriteShare: 0.03,
  ferryWriteShare: 0.5,
};

export interface MixOutcome {
  writeShare: number;
  reads: number;
  writes: number;
  readLimit: number;
  writeLimit: number;
  /** the most requests a second the store can take in total at this mix */
  maxTotal: number;
  /** which limit is passed first when `requestsPerSec` arrive, or none */
  limitedBy: "reads" | "writes" | "both" | "none";
}

export function mixOutcome(writeShare: number, requestsPerSec = MIX_DEMO.requestsPerSec): MixOutcome {
  const w = Math.min(1, Math.max(0, writeShare));
  // capacity 400 with four read copies = 2,000 reads and 400 writes a second, with no locking
  const db = modelOf("database", { capacity: 400, readReplicas: 4, consistency: "Eventual" }, w);
  const reads = requestsPerSec * (1 - w);
  const writes = requestsPerSec * w;
  const overReads = reads > db.readCapacity! + 1e-9;
  const overWrites = writes > db.writeCapacity! + 1e-9;
  return {
    writeShare: w,
    reads,
    writes,
    readLimit: db.readCapacity!,
    writeLimit: db.writeCapacity!,
    maxTotal: db.capacity,
    limitedBy: overReads && overWrites ? "both" : overReads ? "reads" : overWrites ? "writes" : "none",
  };
}
