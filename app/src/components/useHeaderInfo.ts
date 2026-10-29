import { useEffect, useState } from "react";
import { hubOn } from "../shell/hub";
import { featureOn } from "../shell/registry";

export interface HeaderInfo {
  /** The role being prepared for, with days to the interview when a date is set. */
  target: { title: string; daysLeft: number | null } | null;
  streak: number;
  /** Flashcards due today. */
  studyDue: number;
}

const EMPTY: HeaderInfo = { target: null, streak: 0, studyDue: 0 };
const MIN_GAP_MS = 10_000;

/**
 * What the top bar shows about the signed-in person: their target, streak and due cards. The module code is imported only when
 * needed, so the bar costs the first screen nothing. It refreshes when the address changes, at most once every ten seconds.
 */
export function useHeaderInfo(signedIn: boolean): HeaderInfo {
  const [info, setInfo] = useState<HeaderInfo>(EMPTY);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let last = 0;
    const on = () => {
      if (Date.now() - last > MIN_GAP_MS) {
        last = Date.now();
        setTick((t) => t + 1);
      }
    };
    window.addEventListener("hashchange", on);
    window.addEventListener("focus", on);
    return () => {
      window.removeEventListener("hashchange", on);
      window.removeEventListener("focus", on);
    };
  }, []);

  useEffect(() => {
    if (!signedIn || !hubOn()) {
      setInfo(EMPTY);
      return;
    }
    let live = true;
    void (async () => {
      try {
        const { hubApi } = await import("../modules/hub/api");
        const summary = await hubApi.summary();
        let studyDue = 0;
        if (featureOn("study")) {
          try {
            const { studyApi } = await import("../modules/study/api");
            studyDue = (await studyApi.stats()).dueToday;
          } catch {
            /* the bar just omits the count */
          }
        }
        if (live)
          setInfo({
            target: summary.target ? { title: summary.target.title, daysLeft: summary.target.daysLeft } : null,
            streak: summary.streak.days,
            studyDue,
          });
      } catch {
        /* offline or signed out: keep what we had */
      }
    })();
    return () => {
      live = false;
    };
  }, [signedIn, tick]);

  return info;
}
