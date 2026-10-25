/*
  Teaching models for the Module 3 demos that the app's simulator cannot play: fan-out, streams, transactions and stale reads. Each is a
  small, deterministic function with invented numbers. None of them is produced by the app's simulator. The lesson says so beside each.
*/

// ----- fan-out: club noticeboards -----
export const FANOUT = {
  /** how many copies a system can make in a second */
  copiesPerSec: 5000,
  /** how many sources a reader follows, so how many places fan-out on read must look in */
  follows: 30,
  /** a club with more members than this is read from the board, when the system mixes the two */
  mixLimit: 10_000,
  clubs: [
    { id: "small", label: "A club with 40 members", members: 40 },
    { id: "town", label: "A town club with 4,000 members", members: 4000 },
    { id: "famous", label: "A famous club with 4 million members", members: 4_000_000 },
  ],
};

export type FanoutMode = "write" | "read" | "mix";

export interface FanoutOutcome {
  mode: "write" | "read";
  /** copies made when one notice is posted */
  copiesPerPost: number;
  /** places a member looks in each time they open the board */
  lookupsPerView: number;
  /** seconds until the last member can see a new notice */
  secondsToReach: number;
}

export function fanout(members: number, mode: FanoutMode): FanoutOutcome {
  const m: "write" | "read" = mode === "mix" ? (members > FANOUT.mixLimit ? "read" : "write") : mode;
  const copiesPerPost = m === "write" ? members : 1;
  return {
    mode: m,
    copiesPerPost,
    lookupsPerView: m === "write" ? 1 : FANOUT.follows,
    secondsToReach: copiesPerPost / FANOUT.copiesPerSec,
  };
}

// ----- streams: a relay team's baton log -----
export const BATON = {
  parts: 2,
  /** the app needs a stream to keep events at least this long before it counts as replayable */
  replayHours: 24,
  events: [
    { key: "Runner 1", text: "Runner 1 starts" },
    { key: "Runner 2", text: "Runner 2 starts" },
    { key: "Runner 1", text: "Runner 1 hands over" },
    { key: "Runner 3", text: "Runner 3 starts" },
    { key: "Runner 2", text: "Runner 2 hands over" },
    { key: "Runner 3", text: "Runner 3 finishes" },
  ],
};

/** Which part of the stream an event goes to: the same key always goes to the same part. */
export function partOf(key: string, parts: number = BATON.parts): number {
  let h = 0;
  for (const ch of key) h += ch.charCodeAt(0);
  return h % parts;
}

export interface StreamView {
  /** events in each part, in the order they were written */
  parts: { text: string; read: boolean }[][];
  /** events still in the stream's log (all of them, until retention ends) */
  inLog: number;
  /** jobs still waiting in a queue after the same events were taken */
  inQueue: number;
}

/** After a reader has processed the first `read` events. */
export function afterReading(read: number): StreamView {
  const parts: { text: string; read: boolean }[][] = Array.from({ length: BATON.parts }, () => []);
  BATON.events.forEach((e, i) => parts[partOf(e.key)].push({ text: e.text, read: i < read }));
  return { parts, inLog: BATON.events.length, inQueue: BATON.events.length - read };
}

/** Can a reader go back and read an event that is `ageHours` old, from a stream that keeps events for `retentionHours`? */
export const canReplay = (retentionHours: number, ageHours: number): boolean => ageHours <= retentionHours;
export const countsAsReplayable = (retentionHours: number): boolean => retentionHours >= BATON.replayHours;

// ----- transactions: moving money between two accounts -----
export const MOVE = { savings: 200, current: 100, amount: 50 };

export interface MoveOutcome {
  steps: string[];
  savings: number;
  current: number;
  /** what the two accounts hold together; it should stay 300 */
  total: number;
  /** what someone adding the two balances up halfway through the move would see */
  auditHalfway: number;
}

/** `cut`: the power fails after the first step. `transaction`: the two steps are grouped. */
export function moveMoney(transaction: boolean, cut: boolean): MoveOutcome {
  const { savings, current, amount } = MOVE;
  const steps: string[] = [`Take ${amount} out of savings: savings ${savings - amount}.`];
  let s = savings - amount;
  let c = current;
  if (cut) {
    steps.push("The power fails.");
    if (transaction) {
      s = savings;
      steps.push("When the system restarts, the unfinished transaction is undone: savings is put back.");
    } else {
      steps.push("The system restarts. Nothing records that the second step was owed.");
    }
  } else {
    c = current + amount;
    steps.push(`Put ${amount} into current: current ${c}.`);
    if (transaction) steps.push("Both steps are recorded together.");
  }
  // someone adding up the balances after the first step: without a transaction they see the half-done state,
  // with the strongest setting they wait until the move is finished or undone
  const auditHalfway = transaction ? savings + current : savings - amount + current;
  return { steps, savings: s, current: c, total: s + c, auditHalfway };
}

// ----- stale reads: a comment and a copy that is behind -----
export const STALE = { copyLagSec: 3 };

export interface StaleOutcome {
  /** does the reader see their own comment? */
  seen: boolean;
  /** share of reads the original database has to answer */
  originalLoad: number;
}

/**
 * A comment is posted and the page is refreshed `afterSec` later. A read from the original always sees it. A read from a copy
 * sees it only once the copy has caught up, `lagSec` after the post. `copyShare` of reads normally go to a copy.
 */
export function staleRead(source: "original" | "copy", lagSec: number, afterSec: number, copyShare: number): StaleOutcome {
  return { seen: source === "original" || afterSec >= lagSec, originalLoad: 1 - copyShare };
}
