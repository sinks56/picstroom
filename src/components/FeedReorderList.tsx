import { useCallback, useEffect, useRef, useState } from 'react';
import type { Feed } from '../types';

interface Props {
  feeds: Feed[];
  onMove: (feedId: string, toIndex: number) => void;
  onRemove: (feedId: string) => void;
}

interface DragState {
  id: string;
  from: number;
  over: number;
  dy: number;
}

const LONG_PRESS_MS = 350;
const MOVE_TOLERANCE = 8;
const EDGE = 56;

function scrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let n = el?.parentElement; n; n = n.parentElement) {
    const oy = getComputedStyle(n).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight) return n;
  }
  return null;
}

/**
 * Feed list with drag-to-reorder. Touch: drag the ≡ handle right away, or long-press
 * anywhere on a row. Mouse works the same. ↑/↓ buttons are an always-available fallback.
 * Only `transform` changes while dragging, so it stays smooth on phones.
 */
export function FeedReorderList({ feeds, onMove, onRemove }: Props) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const [settling, setSettling] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  const itemRefs = useRef(new Map<string, HTMLLIElement>());
  const session = useRef<{
    id: string;
    from: number;
    pointerId: number;
    startY: number;
    lastY: number;
    startScroll: number;
    scroller: HTMLElement | null;
    mids: number[];
    height: number;
    over: number;
    raf: number;
  } | null>(null);
  const press = useRef<{ timer: number; x: number; y: number; pointerId: number; id: string; el: HTMLElement } | null>(null);
  const dragging = useRef(false);

  const compute = useCallback(() => {
    const s = session.current;
    if (!s) return;
    const scrollDelta = s.scroller ? s.scroller.scrollTop - s.startScroll : 0;
    const dy = s.lastY - s.startY + scrollDelta;
    const center = s.mids[s.from] + dy;
    let over = 0;
    for (let i = 0; i < s.mids.length; i++) if (i !== s.from && s.mids[i] < center) over++;
    s.over = over;
    setDrag({ id: s.id, from: s.from, over, dy });
  }, []);

  const autoScroll = useCallback(() => {
    const s = session.current;
    if (!s) return;
    const sc = s.scroller;
    if (sc) {
      const r = sc.getBoundingClientRect();
      let v = 0;
      if (s.lastY < r.top + EDGE) v = -Math.ceil(((r.top + EDGE - s.lastY) / EDGE) * 14);
      else if (s.lastY > r.bottom - EDGE) v = Math.ceil(((s.lastY - (r.bottom - EDGE)) / EDGE) * 14);
      if (v) {
        const before = sc.scrollTop;
        sc.scrollTop = before + v;
        if (sc.scrollTop !== before) compute();
      }
    }
    s.raf = requestAnimationFrame(autoScroll);
  }, [compute]);

  const begin = useCallback((id: string, pointerId: number, clientY: number, captureEl: HTMLElement) => {
    const from = feeds.findIndex(f => f.id === id);
    if (from === -1) return;
    const els = feeds.map(f => itemRefs.current.get(f.id));
    if (els.some(e => !e)) return;
    const rects = els.map(e => e!.getBoundingClientRect());
    try { captureEl.setPointerCapture(pointerId); } catch { /* pointer already gone */ }
    dragging.current = true;
    session.current = {
      id, from, pointerId,
      startY: clientY, lastY: clientY,
      scroller: scrollParent(listRef.current),
      startScroll: 0,
      mids: rects.map(r => r.top + r.height / 2),
      height: rects[from].height,
      over: from,
      raf: 0
    };
    session.current.startScroll = session.current.scroller?.scrollTop ?? 0;
    setDrag({ id, from, over: from, dy: 0 });
    session.current.raf = requestAnimationFrame(autoScroll);
  }, [feeds, autoScroll]);

  const finish = useCallback((commit: boolean) => {
    const s = session.current;
    session.current = null;
    dragging.current = false;
    if (!s) return;
    cancelAnimationFrame(s.raf);
    // Drop without animating the neighbours back from their shifted positions.
    setSettling(true);
    setDrag(null);
    if (commit && s.over !== s.from) onMove(s.id, s.over);
    requestAnimationFrame(() => requestAnimationFrame(() => setSettling(false)));
  }, [onMove]);

  const cancelPress = useCallback(() => {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
  }, []);

  // While a press/drag is active, stop the page from scrolling under the finger.
  useEffect(() => {
    const onTouchMove = (e: TouchEvent) => {
      if (dragging.current && e.cancelable) e.preventDefault();
    };
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      document.removeEventListener('touchmove', onTouchMove);
      if (session.current) cancelAnimationFrame(session.current.raf);
      cancelPress();
    };
  }, [cancelPress]);

  const onPointerMove = (e: React.PointerEvent) => {
    const p = press.current;
    if (p && p.pointerId === e.pointerId && (Math.abs(e.clientX - p.x) > MOVE_TOLERANCE || Math.abs(e.clientY - p.y) > MOVE_TOLERANCE)) {
      cancelPress(); // it's a scroll, not a long-press
    }
    const s = session.current;
    if (!s || s.pointerId !== e.pointerId) return;
    s.lastY = e.clientY;
    compute();
  };
  const onPointerUp = (e: React.PointerEvent) => {
    cancelPress();
    if (session.current?.pointerId === e.pointerId) finish(true);
  };
  const onPointerCancel = (e: React.PointerEvent) => {
    cancelPress();
    if (session.current?.pointerId === e.pointerId) finish(false);
  };

  const shiftFor = (i: number): number => {
    if (!drag) return 0;
    const h = session.current?.height ?? 0;
    if (drag.from < drag.over && i > drag.from && i <= drag.over) return -h;
    if (drag.over < drag.from && i >= drag.over && i < drag.from) return h;
    return 0;
  };

  return (
    <ul
      ref={listRef}
      className={`ps-reorder${drag ? ' is-dragging' : ''}${settling ? ' is-settling' : ''}`}
      data-testid="feed-reorder-list"
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {feeds.map((feed, i) => {
        const isDragged = drag?.id === feed.id;
        const ty = isDragged ? drag!.dy : shiftFor(i);
        return (
          <li
            key={feed.id}
            ref={el => { if (el) itemRefs.current.set(feed.id, el); else itemRefs.current.delete(feed.id); }}
            className={`ps-reorder-item${isDragged ? ' is-lifted' : ''}`}
            style={ty ? { transform: `translate3d(0, ${ty}px, 0)` } : undefined}
            data-testid="feed-reorder-item"
            data-feed-id={feed.id}
            onContextMenu={e => e.preventDefault()}
            onPointerDown={e => {
              if (session.current || (e.target as HTMLElement).closest('button')) return;
              if (e.pointerType === 'mouse' && e.button !== 0) return;
              const el = e.currentTarget;
              const { pointerId, clientX, clientY } = e;
              cancelPress();
              press.current = {
                pointerId, x: clientX, y: clientY, id: feed.id, el,
                timer: window.setTimeout(() => {
                  const p = press.current;
                  press.current = null;
                  if (p) begin(p.id, p.pointerId, p.y, p.el);
                }, LONG_PRESS_MS)
              };
            }}
          >
            <span
              className="ps-reorder-handle"
              aria-hidden="true"
              data-testid="feed-drag-handle"
              onPointerDown={e => {
                if (e.pointerType === 'mouse' && e.button !== 0) return;
                e.stopPropagation();
                e.preventDefault();
                cancelPress();
                begin(feed.id, e.pointerId, e.clientY, e.currentTarget.closest('li')!);
              }}
            >
              <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
                <rect x="2" y="4" width="12" height="1.5" /><rect x="2" y="7.25" width="12" height="1.5" /><rect x="2" y="10.5" width="12" height="1.5" />
              </svg>
            </span>
            <span className="ps-reorder-text">
              <span className="ps-reorder-title">{feed.title}</span>
              <span className="ps-reorder-url">{feed.url.replace(/^https?:\/\/(www\.)?/, '')}</span>
            </span>
            <button
              className="ps-reorder-btn"
              onClick={() => onMove(feed.id, i - 1)}
              disabled={i === 0}
              aria-label={`Move ${feed.title} up`}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M6 15l6-6 6 6" /></svg>
            </button>
            <button
              className="ps-reorder-btn"
              onClick={() => onMove(feed.id, i + 1)}
              disabled={i === feeds.length - 1}
              aria-label={`Move ${feed.title} down`}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M6 9l6 6 6-6" /></svg>
            </button>
            <button
              className="ps-reorder-btn is-danger"
              onClick={() => { if (confirm(`Remove "${feed.title}"?`)) onRemove(feed.id); }}
              aria-label={`Delete ${feed.title}`}
            >
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth={1.6}><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
