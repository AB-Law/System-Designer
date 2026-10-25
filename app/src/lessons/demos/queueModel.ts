/*
  Teaching model for the backlog demo. Orders arrive at a rate that can change over time, and workers finish them at a fixed rate.
  Each minute the backlog becomes: what was waiting, plus what arrived, minus what the workers could finish (never below zero).
  It is a teaching model, not the app's simulator: the app reports whether a consumer keeps up, but it does not play out waiting
  time or backlog over time. The numbers are invented for the lesson.
*/
export const QUEUE_DEMO = {
  /** orders a minute on a quiet day */
  quiet: 10,
  /** orders a minute during the lunchtime rush */
  rush: 30,
  rushMinutes: 10,
  /** drinks one barista can make in a minute */
  perWorker: 10,
  workers: 2,
  /** how long the demo follows the queue */
  minutes: 40,
};

export interface QueueMinute {
  minute: number;
  arrivals: number;
  /** orders waiting at the end of this minute */
  backlog: number;
}

export interface QueueOutcome {
  drain: number;
  minutes: QueueMinute[];
  peakBacklog: number;
  /** how long the unluckiest order waits, in minutes: the longest backlog divided by the drain rate */
  longestWait: number;
  /** the minute the backlog is empty again after the rush, or null if it is not empty by the end */
  clearedAt: number | null;
  /** true when orders are still arriving faster than they are finished at the end, so the backlog is still growing */
  stillGrowing: boolean;
}

export function runQueue(o: { quiet: number; rush: number; rushMinutes: number; drain: number; minutes?: number }): QueueOutcome {
  const total = o.minutes ?? QUEUE_DEMO.minutes;
  const minutes: QueueMinute[] = [];
  let backlog = 0;
  for (let t = 0; t < total; t++) {
    const arrivals = t < o.rushMinutes ? o.rush : o.quiet;
    backlog = Math.max(0, backlog + arrivals - o.drain);
    minutes.push({ minute: t + 1, arrivals, backlog });
  }
  const peakBacklog = Math.max(0, ...minutes.map((m) => m.backlog));
  const after = minutes.find((m) => m.minute > o.rushMinutes && m.backlog === 0);
  return {
    drain: o.drain,
    minutes,
    peakBacklog,
    longestWait: o.drain > 0 ? peakBacklog / o.drain : Infinity,
    clearedAt: peakBacklog === 0 ? 0 : (after?.minute ?? null),
    stillGrowing: minutes[minutes.length - 1].arrivals > o.drain,
  };
}
