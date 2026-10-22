import { useEffect, useState } from 'react';

export interface ViewportState {
  scrollY: number;
  height: number;
  width: number;
}

/**
 * Window scroll position and size, throttled to one update per animation frame and only
 * when the position moved by at least `step` px. Windowed lists re-render a few times per
 * screen of scrolling instead of on every scroll event.
 */
export function useViewport(step = 120): ViewportState {
  const [state, setState] = useState<ViewportState>(() => ({
    scrollY: window.scrollY,
    height: window.innerHeight,
    width: window.innerWidth
  }));

  useEffect(() => {
    let raf = 0;
    let last = { scrollY: window.scrollY, height: window.innerHeight, width: window.innerWidth };
    const update = (force: boolean) => {
      raf = 0;
      const next = { scrollY: window.scrollY, height: window.innerHeight, width: window.innerWidth };
      if (force || Math.abs(next.scrollY - last.scrollY) >= step || next.height !== last.height || next.width !== last.width) {
        last = next;
        setState(next);
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(() => update(false));
    };
    const onResize = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => update(true));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    update(true);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
    };
  }, [step]);

  return state;
}
