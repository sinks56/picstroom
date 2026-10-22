import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { FeedImage } from '../types';
import { useStore } from '../store';
import { useViewport } from '../hooks/useViewport';
import { aspectOf } from '../lib/thumbs';
import { Thumb } from './Thumb';

interface MasonryGridProps {
  images: FeedImage[];
  onImageClick: (image: FeedImage, allImages: FeedImage[], index: number, feedId?: string) => void;
}

/** Never mount more cells than this, whatever the viewport/overscan says. */
export const MAX_MOUNTED_CELLS = 90;

interface Cell {
  image: FeedImage;
  index: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export function columnsFor(width: number): number {
  if (width < 600) return 2;
  if (width < 900) return 3;
  if (width < 1200) return 4;
  return 5;
}

/**
 * Shortest-column masonry using stored aspect ratios. Integer edges (x/w from rounded
 * column boundaries, rounded heights) keep the grid gap-free.
 */
export function layoutMasonry(images: FeedImage[], width: number): { cells: Cell[]; height: number } {
  const cols = columnsFor(width);
  const colW = width / cols;
  const edges = Array.from({ length: cols + 1 }, (_, i) => Math.round(i * colW));
  const heights = new Array(cols).fill(0);
  const cells: Cell[] = [];
  images.forEach((image, index) => {
    let c = 0;
    for (let i = 1; i < cols; i++) if (heights[i] < heights[c]) c = i;
    const w = edges[c + 1] - edges[c];
    const h = Math.round(w / aspectOf(image, 1, 0.5, 2));
    cells.push({ image, index, x: edges[c], y: heights[c], w, h });
    heights[c] += h;
  });
  return { cells, height: Math.max(0, ...heights) };
}

export function MasonryGrid({ images, onImageClick }: MasonryGridProps) {
  const loadOlderPosts = useStore(s => s.loadOlderPosts);
  const olderStatus = useStore(s => s.olderStatus);
  const useProxy = useStore(s => s.settings.optimizeImages !== false);
  const viewport = useViewport(100);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerTop, setContainerTop] = useState(0);
  const [width, setWidth] = useState(() => document.documentElement.clientWidth);
  const [failed, setFailed] = useState<Set<string>>(() => new Set());

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      setContainerTop(rect.top + window.scrollY);
      setWidth(Math.round(rect.width));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const list = useMemo(() => (failed.size ? images.filter(i => !failed.has(i.id)) : images), [images, failed]);
  const { cells, height } = useMemo(() => layoutMasonry(list, width || 1), [list, width]);

  const visible = useMemo(() => {
    const top = viewport.scrollY - containerTop - viewport.height;
    const bottom = viewport.scrollY - containerTop + viewport.height * 2;
    const out = cells.filter(c => c.y + c.h >= top && c.y <= bottom);
    if (out.length <= MAX_MOUNTED_CELLS) return out;
    const mid = viewport.scrollY - containerTop + viewport.height / 2;
    return out
      .sort((a, b) => Math.abs(a.y + a.h / 2 - mid) - Math.abs(b.y + b.h / 2 - mid))
      .slice(0, MAX_MOUNTED_CELLS);
  }, [cells, viewport.scrollY, viewport.height, containerTop]);

  // Infinite scroll: ask for older posts when within ~2.5 screens of the end.
  const nearEnd = viewport.scrollY + viewport.height * 2.5 >= containerTop + height;
  useEffect(() => {
    if (nearEnd && olderStatus === 'idle' && list.length > 0) loadOlderPosts();
  }, [nearEnd, olderStatus, list.length, loadOlderPosts]);

  const handleOpen = useCallback((image: FeedImage) => {
    const idx = list.findIndex(i => i.id === image.id);
    if (idx >= 0) onImageClick(image, list, idx);
  }, [list, onImageClick]);

  const handleFail = useCallback((id: string) => {
    setFailed(prev => (prev.has(id) ? prev : new Set(prev).add(id)));
  }, []);

  // After the viewer closes, make sure the last viewed picture is on screen.
  useEffect(() => {
    const onReveal = (e: Event) => {
      const id = (e as CustomEvent<{ imageId: string }>).detail?.imageId;
      const cell = cells.find(c => c.image.id === id);
      if (!cell) return;
      const top = containerTop + cell.y;
      const vh = window.innerHeight;
      if (top < window.scrollY + 48 || top + cell.h > window.scrollY + vh) {
        window.scrollTo({ top: Math.max(0, top - vh / 3), behavior: 'auto' });
      }
    };
    window.addEventListener('picstroom:reveal', onReveal);
    return () => window.removeEventListener('picstroom:reveal', onReveal);
  }, [cells, containerTop]);

  if (images.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
        <h3 className="text-sm font-medium mb-1">No images in this time window</h3>
        <button className="text-xs text-[var(--color-accent)]" onClick={() => loadOlderPosts()}>Load older posts</button>
      </div>
    );
  }

  return (
    <div>
      <div ref={containerRef} className="relative w-full" style={{ height }} data-testid="grid">
        {visible.map(cell => (
          <Thumb
            key={cell.image.id}
            image={cell.image}
            cssWidth={cell.w}
            useProxy={useProxy}
            style={{ left: cell.x, top: cell.y, width: cell.w, height: cell.h }}
            onOpen={handleOpen}
            onFail={handleFail}
          />
        ))}
      </div>
      <ListEnd status={olderStatus} onRetry={() => loadOlderPosts({ force: true })} />
    </div>
  );
}

export function ListEnd({ status, onRetry }: { status: string; onRetry: () => void }) {
  return (
    <div className="flex justify-center items-center h-16 text-[11px] text-[var(--color-text-muted)]" data-testid="list-end" data-status={status}>
      {status === 'loading' && <span className="ps-spinner" aria-label="Loading older posts" />}
      {status === 'waiting' && (
        <button onClick={onRetry} className="px-3 py-1 border border-[var(--color-border)]">Couldn't load older posts · Retry</button>
      )}
      {status === 'end' && <span>No more posts</span>}
    </div>
  );
}
