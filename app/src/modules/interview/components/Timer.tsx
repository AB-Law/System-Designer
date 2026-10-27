import { useEffect, useState } from "react";
import { clock } from "../format";

/** Time since the interview began against its length. `skew` is how far the server clock is ahead of this one. */
export function Timer({ startedAt, durationMin, skew }: { startedAt: number | null; durationMin: number; skew: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (startedAt === null) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [startedAt]);

  const elapsed = startedAt === null ? 0 : now + skew - startedAt;
  const over = elapsed >= durationMin * 60_000;
  return (
    <span className={"iv-timer" + (over ? " over" : "")} role="timer" aria-label="Interview time">
      {clock(elapsed)} / {durationMin}:00{over ? " · time is up" : ""}
    </span>
  );
}
