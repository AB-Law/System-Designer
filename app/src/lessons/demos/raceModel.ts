/*
  Teaching model for the two-writers demo. Two housemates each withdraw 50 from a joint account holding 100 at the same moment.
  Each withdrawal is three small steps: read the balance, work out the new one, write it back. The model plays the steps out in a
  fixed order, once with nothing to stop them overlapping and once with a lock. It is a teaching model: one value, two writers,
  one fixed interleaving. It is not produced by the app's simulator, which only checks that a design has a lock and charges for it.
*/
export const RACE = { start: 100, amount: 50 };

export interface RaceStep {
  /** what happened, in one sentence */
  text: string;
  /** the balance in the account after this step */
  balance: number;
  /** the writer who waited this step (a lock was held), if any */
  waiting?: "A" | "B";
}

export interface RaceOutcome {
  steps: RaceStep[];
  finalBalance: number;
  /** money that has actually been handed out */
  paidOut: number;
  /** what the balance should be if every withdrawal counted */
  expected: number;
}

export function playRace(withLock: boolean, start = RACE.start, amount = RACE.amount): RaceOutcome {
  const steps: RaceStep[] = [];
  let balance = start;
  const paidOut = 2 * amount;
  if (!withLock) {
    // both read before either writes, so both work from the same old balance
    const seenA = balance;
    steps.push({ text: `A reads the balance and sees ${seenA}.`, balance });
    const seenB = balance;
    steps.push({ text: `B reads the balance and sees ${seenB}.`, balance });
    balance = seenA - amount;
    steps.push({ text: `A writes back ${seenA} − ${amount} = ${balance}.`, balance });
    balance = seenB - amount;
    steps.push({ text: `B writes back ${seenB} − ${amount} = ${balance}. A's withdrawal has been overwritten.`, balance });
  } else {
    const seenA = balance;
    steps.push({ text: `A takes the lock and reads the balance: ${seenA}.`, balance });
    steps.push({ text: "B asks for the lock. A holds it, so B waits.", balance, waiting: "B" });
    balance = seenA - amount;
    steps.push({ text: `A writes back ${seenA} − ${amount} = ${balance} and releases the lock.`, balance });
    const seenB = balance;
    steps.push({ text: `B takes the lock and reads the balance: ${seenB}.`, balance });
    balance = seenB - amount;
    steps.push({ text: `B writes back ${seenB} − ${amount} = ${balance} and releases the lock.`, balance });
  }
  return { steps, finalBalance: balance, paidOut, expected: start - paidOut };
}
