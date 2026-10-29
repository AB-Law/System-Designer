import { useEffect, useState } from "react";

/** Animates the leading whole number of a figure from 0 up to its value ("75%" counts to 75, then keeps the "%"). Instant under reduced motion. */
export function CountUp({ value, ms = 1000, delay = 0 }: { value: string; ms?: number; delay?: number }) {
  const m = /^(\d+)(.*)$/.exec(value);
  const target = m ? Number(m[1]) : null;
  const [shown, setShown] = useState<number | null>(null);

  useEffect(() => {
    if (target === null || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const t0 = performance.now() + delay;
    const tick = (now: number) => {
      const p = Math.min(1, Math.max(0, (now - t0) / ms));
      setShown(Math.round(target * (1 - Math.pow(1 - p, 4))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    setShown(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms, delay]);

  if (!m || shown === null || target === null) return <>{value}</>;
  return (
    <>
      {shown}
      {m[2]}
    </>
  );
}
