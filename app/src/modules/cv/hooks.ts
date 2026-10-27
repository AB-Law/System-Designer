import { useCallback, useState } from "react";
import { toast } from "../../ui/Toast";
import { errText } from "./store";

/** Run an API call. A failure becomes a toast and `undefined`; `done` is shown as a success toast. */
export async function attempt<T>(fn: () => Promise<T>, done?: string): Promise<T | undefined> {
  try {
    const result = await fn();
    if (done) toast(done, "good");
    return result;
  } catch (e) {
    toast(errText(e), "bad");
    return undefined;
  }
}

/** `attempt` that also says whether a call is in flight, so a button can disable itself. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const run = useCallback(async <T>(fn: () => Promise<T>, done?: string): Promise<T | undefined> => {
    setBusy(true);
    try {
      return await attempt(fn, done);
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, run };
}
