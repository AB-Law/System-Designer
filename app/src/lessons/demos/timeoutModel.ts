/*
  Teaching model for the timeout demo. A provider usually answers in about `typicalMs`, but not every call takes exactly that: here
  each call takes a time spread evenly from half to one and a half times the typical figure. A timeout makes the caller stop waiting
  after `timeoutMs`. A call that has not come back by then is "timed out": the caller moves on with a fallback, or shows an error.
  The model also says what a timeout does NOT tell you: the provider may still finish the work after the caller has given up.
  It is a teaching model with an invented spread; real response times are not evenly spread.
*/
export const TIMEOUT_DEMO = { typicalMs: 200, timeoutMs: 150, slowTypicalMs: 800, slowTimeoutMs: 300 };

export interface TimeoutOutcome {
  /** the fastest and slowest a call takes */
  fastestMs: number;
  slowestMs: number;
  /** share of calls that do not come back within the timeout */
  timedOut: number;
  /** how long a caller waits on average, counting the wait it gives up after */
  averageWaitMs: number;
  /** share of calls whose answer is used */
  answered: number;
  /** with a fallback, the share of visitors who still see the page; without one, the same share as `answered` */
  pageShown: number;
}

export function timeoutOutcome(typicalMs: number, timeoutMs: number, hasFallback: boolean): TimeoutOutcome {
  const a = typicalMs * 0.5;
  const b = typicalMs * 1.5;
  const width = b - a;
  const timedOut = timeoutMs <= a ? 1 : timeoutMs >= b ? 0 : (b - timeoutMs) / width;
  // E[min(X, T)] for X spread evenly over [a, b]
  const averageWaitMs =
    timeoutMs <= a
      ? timeoutMs
      : timeoutMs >= b
        ? (a + b) / 2
        : ((timeoutMs - a) * ((a + timeoutMs) / 2) + (b - timeoutMs) * timeoutMs) / width;
  return { fastestMs: a, slowestMs: b, timedOut, averageWaitMs, answered: 1 - timedOut, pageShown: hasFallback ? 1 : 1 - timedOut };
}
