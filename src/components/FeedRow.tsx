import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Feed, FeedImage } from '../types';
import { useStore } from '../store';
import { aspectOf } from '../lib/thumbs';
import { Thumb } from './Thumb';

interface FeedRowProps {
  feed: Feed;
  images: FeedImage[];
  onImageClick: (image: FeedImage, allImages: FeedImage[], index: number, feedId?: string) => void;
  onManageFeed: (feed: Feed) => void;
  /** Called when the row is scrolled to its last cells (load older posts). */
  onNearEnd?: () => void;
}

export const ROW_HEIGHT = 140;
const MAX_ROW_CELLS = 24;

/** Fixed-height row layout from stored aspect ratios: widths never change after load. */
export function layoutRow(images: FeedImage[], rowHeight = ROW_HEIGHT) {
  let x = 0;
  const cells = images.map((image, index) => {
    const w = Math.round(rowHeight * aspectOf(image, 1, 0.6, 1.8));
    const cell = { image, index, x, w };
    x += w;
    return cell;
  });
  return { cells, width: x };
}

export const FeedRow = memo(function FeedRow({ feed, images, onImageClick, onManageFeed, onNearEnd }: FeedRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const refreshFeed = useStore(s => s.refreshFeed);
  const isLoading = useStore(s => s.loadingFeeds.has(feed.id));
  const useProxy = useStore(s => s.settings.optimizeImages !== false);
  const [near, setNear] = useState(false);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [viewW, setViewW] = useState(() => window.innerWidth);
  const [failed, setFailed] = useState<Set<string>>(() => new Set());

  // Only rows within ~1 screen of the viewport mount any images.
  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), { rootMargin: '100% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let raf = 0;
    let last = el.scrollLeft;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (Math.abs(el.scrollLeft - last) >= 60) {
          last = el.scrollLeft;
          setScrollLeft(last);
        }
      });
    };
    const ro = new ResizeObserver(() => setViewW(el.clientWidth));
    ro.observe(el);
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      if (raf) cancelAnimationFrame(raf);
      el.removeEventListener('scroll', onScroll);
      ro.disconnect();
    };
  }, []);

  const list = useMemo(() => (failed.size ? images.filter(i => !failed.has(i.id)) : images), [images, failed]);
  const { cells, width } = useMemo(() => layoutRow(list), [list]);

  const visible = useMemo(() => {
    if (!near) return [];
    const from = scrollLeft - viewW;
    const to = scrollLeft + viewW * 2;
    return cells.filter(c => c.x + c.w >= from && c.x <= to).slice(0, MAX_ROW_CELLS);
  }, [cells, near, scrollLeft, viewW]);

  const lastVisible = visible.length ? visible[visible.length - 1].index : -1;
  useEffect(() => {
    // Only after the user actually scrolled the row, so short rows don't page on mount.
    if (onNearEnd && scrollLeft > 0 && list.length > 0 && lastVisible >= list.length - 1) onNearEnd();
  }, [lastVisible, list.length, onNearEnd, scrollLeft]);

  const handleOpen = useCallback((image: FeedImage) => {
    const idx = list.findIndex(i => i.id === image.id);
    if (idx >= 0) onImageClick(image, list, idx, feed.id);
  }, [list, onImageClick, feed.id]);

  const handleFail = useCallback((id: string) => {
    setFailed(prev => (prev.has(id) ? prev : new Set(prev).add(id)));
  }, []);

  useEffect(() => {
    const onReveal = (e: Event) => {
      const id = (e as CustomEvent<{ imageId: string }>).detail?.imageId;
      const cell = cells.find(c => c.image.id === id);
      const el = scrollRef.current;
      if (!cell || !el) return;
      if (cell.x < el.scrollLeft || cell.x + cell.w > el.scrollLeft + el.clientWidth) {
        el.scrollLeft = Math.max(0, cell.x - el.clientWidth / 3);
        setScrollLeft(el.scrollLeft);
      }
    };
    window.addEventListener('picstroom:reveal', onReveal);
    return () => window.removeEventListener('picstroom:reveal', onReveal);
  }, [cells]);

  return (
    <section ref={rowRef} className="ps-row" data-feed-id={feed.id}>
      <div className="ps-row-head">
        <button onClick={() => onManageFeed(feed)} className="ps-row-title" aria-label={`Manage ${feed.title}`}>
          <h2>{feed.title}</h2>
          <span className="ps-count">{images.length}</span>
          {feed.errorMessage && <span className="ps-err" title={feed.errorMessage}>!</span>}
        </button>
        <button
          onClick={() => refreshFeed(feed.id)}
          disabled={isLoading}
          className="ps-icon-btn ps-icon-sm"
          aria-label="Refresh feed"
        >
          <svg className={isLoading ? 'animate-spin' : ''} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="square" d="M16.023 9.348h4.992V4.356M2.985 19.644v-4.992h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
          </svg>
        </button>
      </div>

      <div ref={scrollRef} className="ps-row-scroll" style={{ height: ROW_HEIGHT }}>
        {images.length === 0 ? (
          <div className="ps-row-empty">
            {isLoading ? <span className="ps-spinner" /> : <button onClick={() => refreshFeed(feed.id)}>No images · Refresh</button>}
          </div>
        ) : (
          <div style={{ width, height: ROW_HEIGHT, position: 'relative' }}>
            {visible.map(cell => (
              <Thumb
                key={cell.image.id}
                image={cell.image}
                cssWidth={cell.w}
                useProxy={useProxy}
                style={{ left: cell.x, top: 0, width: cell.w, height: ROW_HEIGHT }}
                onOpen={handleOpen}
                onFail={handleFail}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
});
