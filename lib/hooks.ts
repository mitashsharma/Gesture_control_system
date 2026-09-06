'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** `prefers-reduced-motion` as reactive state. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

/** True while the element is at least partly on screen (one observer per node). */
export function useInView<T extends HTMLElement = HTMLDivElement>(
  rootMargin = '120px',
  threshold = 0.01,
) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { rootMargin, threshold },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [rootMargin, threshold]);

  return { ref, inView } as const;
}

/** True only when the document itself is visible (tab focused, not minimized). */
export function useDocumentVisible(): boolean {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const onVis = () => setVisible(document.visibilityState === 'visible');
    onVis();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('blur', onVis);
    window.addEventListener('focus', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('blur', onVis);
      window.removeEventListener('focus', onVis);
    };
  }, []);
  return visible;
}

/**
 * Single requestAnimationFrame driver. The callback lives in a ref so
 * updating it never tears down the loop, and the loop is fully stopped
 * (no rAF handle retained) whenever `active` is false.
 */
export function useRafLoop(
  callback: (time: number, deltaMs: number) => void,
  active: boolean,
) {
  const cbRef = useRef(callback);
  cbRef.current = callback;

  useEffect(() => {
    if (!active) return;
    let raf = 0;
    let last = performance.now();
    let alive = true;

    const tick = (t: number) => {
      if (!alive) return;
      // Clamp so a backgrounded/throttled tab cannot produce a huge jump.
      const dt = Math.min(48, t - last);
      last = t;
      cbRef.current(t, dt);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [active]);
}

/**
 * Fixed-step interval that suspends itself when the tab is hidden.
 * Returns the current tick count for cheap dependency wiring.
 */
export function useLiveInterval(callback: () => void, ms: number, active: boolean) {
  const cbRef = useRef(callback);
  cbRef.current = callback;
  const docVisible = useDocumentVisible();
  const enabled = active && docVisible;

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => cbRef.current(), ms);
    return () => clearInterval(id);
  }, [enabled, ms]);

  return enabled;
}

/** ResizeObserver → size state, debounced to one frame. */
export function useElementSize<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    let raf = 0;
    const ro = new ResizeObserver(([entry]) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const { width, height } = entry.contentRect;
        setSize((prev) =>
          Math.abs(prev.width - width) < 1 && Math.abs(prev.height - height) < 1
            ? prev
            : { width, height },
        );
      });
    });
    ro.observe(node);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return { ref, ...size } as const;
}

/** rAF-throttled scroll position, used only by the sticky nav. */
export function useScrolledPast(offset = 24) {
  const [past, setPast] = useState(false);
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setPast(window.scrollY > offset));
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
    };
  }, [offset]);
  return past;
}

/** Smooth-scroll to a section id, honouring reduced motion. */
export function useScrollToSection() {
  return useCallback((id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    history.replaceState(null, '', `#${id}`);
  }, []);
}
