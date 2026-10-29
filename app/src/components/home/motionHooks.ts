import { useEffect, useRef, useState, type RefObject } from "react";

export const reducedMotion = (): boolean => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** True while the element is on screen. Starts true without IntersectionObserver so nothing is left idle. */
export function useInView<T extends Element>(): [RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(typeof IntersectionObserver === "undefined");
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, inView];
}

/** How far through a tall section the viewport has scrolled, 0 at its top and 1 when its last screen is reached. */
export function useScrollProgress<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [p, setP] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const measure = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const total = el.offsetHeight - window.innerHeight;
      const next = total > 0 ? Math.min(1, Math.max(0, -r.top / total)) : 0;
      setP((prev) => (Math.abs(prev - next) < 0.002 ? prev : next));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  return [ref, p];
}

/** Pulls a control a few pixels toward the pointer and lets it settle back. Fine pointers only, never under reduced motion. */
export function useMagnet<T extends HTMLElement>(strength = 0.28, max = 10): RefObject<T | null> {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion() || !window.matchMedia("(pointer: fine)").matches) return;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) * strength;
      const dy = (e.clientY - (r.top + r.height / 2)) * strength;
      el.style.transition = "transform 0.1s";
      el.style.transform = `translate(${Math.max(-max, Math.min(max, dx))}px, ${Math.max(-max, Math.min(max, dy))}px)`;
    };
    const leave = () => {
      el.style.transition = "transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)";
      el.style.transform = "";
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    return () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
    };
  }, [strength, max]);
  return ref;
}

/** Eases a displayed number toward its target. Jumps straight there under reduced motion. */
export function useEased(target: number, ms = 600): number {
  const [v, setV] = useState(target);
  const cur = useRef(target);
  useEffect(() => {
    if (reducedMotion()) {
      cur.current = target;
      setV(target);
      return;
    }
    const from = cur.current;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      cur.current = from + (target - from) * (1 - (1 - p) ** 3);
      setV(cur.current);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

/** True under a media query, kept current. */
export function useMedia(query: string): boolean {
  const [on, setOn] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const f = () => setOn(m.matches);
    m.addEventListener("change", f);
    f();
    return () => m.removeEventListener("change", f);
  }, [query]);
  return on;
}

/**
 * Marks every [data-rv] inside the page, including ones added later by lazy sections, as shown once it scrolls into view, by setting
 * the attribute itself to "in".
 * It is an attribute, not a class, so a re-render of the element (a band switching on) cannot undo it.
 * Without script the content simply stays visible.
 */
export function useReveal<T extends HTMLElement>(): RefObject<T | null> {
  const root = useRef<T | null>(null);
  useEffect(() => {
    const el = root.current;
    if (!el || !("IntersectionObserver" in window)) return;
    el.classList.add("rv-on");
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && (e.target.setAttribute("data-rv", "in"), io.unobserve(e.target))),
      { rootMargin: "0px 0px 12% 0px" },
    );
    // Sections that load after the first screen add their own [data-rv] later, so new ones are picked up as they arrive.
    const seen = new WeakSet<Element>();
    const scan = () =>
      el.querySelectorAll("[data-rv]").forEach((n) => {
        if (!seen.has(n)) {
          seen.add(n);
          io.observe(n);
        }
      });
    scan();
    const mo = new MutationObserver(scan);
    mo.observe(el, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, []);
  return root;
}
