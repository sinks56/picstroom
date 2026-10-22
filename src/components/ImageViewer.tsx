import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, useMotionValue, useTransform, animate, type MotionValue } from 'framer-motion';
import type { FeedImage } from '../types';
import { useStore } from '../store';
import { cellSources, viewerSources, thumbBucket, corsFor } from '../lib/thumbs';
import { lockScroll } from '../lib/scroll-lock';
import { logDiag } from '../lib/diagnostics';

interface ImageViewerProps {
  images: FeedImage[];
  initialIndex: number;
  onClose: (lastIndex: number) => void;
  onIndexChange?: (index: number) => void;
}

/** Large sources that finished decoding this session: remounted slots show instantly. */
const decodedLarge = new Set<string>();
const SPRING = { type: 'spring' as const, stiffness: 320, damping: 36, mass: 0.9 };
const MAX_SCALE = 4;
/** Black gap between slides while swiping. */
const GAP = 14;

function preload(src: string) {
  if (decodedLarge.has(src)) return;
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  img.decode().then(() => decodedLarge.add(src)).catch(() => { /* fallback handled by slot */ });
}

/**
 * Full-screen viewer built as a horizontal track: every slot sits at left = i * width and
 * the whole track moves with one transform. Prev/current/next stay mounted (keyed by
 * image id), so swiping never swaps a src or remounts the picture that is on screen;
 * changing index only retargets the track animation. That removes the old frame stutter
 * (re-keyed <img> fading in from opacity 0 at scale 0.95 after every swipe).
 */
export function ImageViewer({ images, initialIndex, onClose, onIndexChange }: ImageViewerProps) {
  const [index, setIndex] = useState(() => Math.min(Math.max(0, initialIndex), images.length - 1));
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const [showUI, setShowUI] = useState(true);
  const [zoomed, setZoomed] = useState(false);
  const toggleFavorite = useStore(s => s.toggleFavorite);
  const favoriteIds = useStore(s => s.favoriteIds);
  const useProxy = useStore(s => s.settings.optimizeImages !== false);

  const trackX = useMotionValue(-index * (size.w + GAP));
  const dragY = useMotionValue(0);
  const scale = useMotionValue(1);
  const panX = useMotionValue(0);
  const panY = useMotionValue(0);
  const bgOpacity = useTransform(dragY, v => 1 - Math.min(Math.abs(v) / (size.h * 0.6), 0.85));
  const closing = useRef(false);
  const indexRef = useRef(index);
  indexRef.current = index;

  useEffect(() => lockScroll(), []);
  useEffect(() => { onIndexChange?.(index); }, [index, onIndexChange]);

  useEffect(() => {
    const onResize = () => {
      const s = { w: window.innerWidth, h: window.innerHeight };
      setSize(s);
      trackX.set(-indexRef.current * (s.w + GAP));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [trackX]);

  const screenPx = Math.ceil(Math.max(size.w, size.h) * Math.min(window.devicePixelRatio || 1, 2));
  const sourcesFor = useCallback((img: FeedImage) => viewerSources(img, screenPx, useProxy), [screenPx, useProxy]);

  // Warm the decode cache for the two pictures beyond the mounted neighbours.
  useEffect(() => {
    for (const i of [index + 2, index - 2, index + 3]) {
      const img = images[i];
      if (img) preload(sourcesFor(img)[0]);
    }
  }, [index, images, sourcesFor]);

  const resetZoom = useCallback((animated = true) => {
    setZoomed(false);
    if (animated) {
      animate(scale, 1, SPRING);
      animate(panX, 0, SPRING);
      animate(panY, 0, SPRING);
    } else {
      scale.set(1); panX.set(0); panY.set(0);
    }
  }, [scale, panX, panY]);

  const goTo = useCallback((next: number, velocity = 0) => {
    const clamped = Math.min(Math.max(0, next), images.length - 1);
    if (clamped !== indexRef.current) resetZoom(false);
    setIndex(clamped);
    animate(trackX, -clamped * (size.w + GAP), { ...SPRING, velocity });
  }, [images.length, resetZoom, size.w, trackX]);

  const close = useCallback((direction = 0) => {
    if (closing.current) return;
    closing.current = true;
    const finish = () => onClose(indexRef.current);
    if (direction) {
      animate(dragY, direction * size.h, { duration: 0.18, ease: 'easeIn' }).then(finish);
    } else {
      finish();
    }
  }, [dragY, onClose, size.h]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') goTo(indexRef.current + 1);
      else if (e.key === 'ArrowLeft') goTo(indexRef.current - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close, goTo]);

  // ---- Gestures (pointer events: touch, pen and mouse) ----------------------------
  const g = useRef({
    pointers: new Map<number, { x: number; y: number }>(),
    startX: 0, startY: 0, startT: 0, axis: '' as '' | 'x' | 'y' | 'pan' | 'pinch',
    baseTrack: 0, basePanX: 0, basePanY: 0, pinchDist: 0, pinchScale: 1,
    samples: [] as { x: number; y: number; t: number }[],
    lastTap: 0, tapTimer: 0
  });

  const onPointerDown = (e: React.PointerEvent) => {
    const s = g.current;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    s.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (s.pointers.size === 2) {
      const [a, b] = [...s.pointers.values()];
      s.axis = 'pinch';
      s.pinchDist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      s.pinchScale = scale.get();
      return;
    }
    s.startX = e.clientX; s.startY = e.clientY; s.startT = performance.now();
    s.axis = zoomed ? 'pan' : '';
    s.baseTrack = trackX.get();
    s.basePanX = panX.get(); s.basePanY = panY.get();
    s.samples = [{ x: e.clientX, y: e.clientY, t: s.startT }];
    trackX.stop(); // grab the track mid-animation without a jump
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const s = g.current;
    if (!s.pointers.has(e.pointerId)) return;
    s.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (s.axis === 'pinch' && s.pointers.size >= 2) {
      const [a, b] = [...s.pointers.values()];
      const next = Math.min(MAX_SCALE, Math.max(1, s.pinchScale * (Math.hypot(a.x - b.x, a.y - b.y) / s.pinchDist)));
      scale.set(next);
      if (next > 1.02 && !zoomed) setZoomed(true);
      return;
    }
    const dx = e.clientX - s.startX;
    const dy = e.clientY - s.startY;
    s.samples.push({ x: e.clientX, y: e.clientY, t: performance.now() });
    if (s.samples.length > 6) s.samples.shift();
    if (!s.axis) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      s.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    }
    if (s.axis === 'x') {
      const atStart = indexRef.current === 0 && dx > 0;
      const atEnd = indexRef.current === images.length - 1 && dx < 0;
      trackX.set(s.baseTrack + (atStart || atEnd ? dx * 0.3 : dx));
    } else if (s.axis === 'y') {
      dragY.set(dy);
    } else if (s.axis === 'pan') {
      const k = scale.get();
      const maxX = (size.w * (k - 1)) / 2;
      const maxY = (size.h * (k - 1)) / 2;
      panX.set(Math.min(maxX, Math.max(-maxX, s.basePanX + dx)));
      panY.set(Math.min(maxY, Math.max(-maxY, s.basePanY + dy)));
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const s = g.current;
    s.pointers.delete(e.pointerId);
    if (s.axis === 'pinch') {
      if (s.pointers.size === 0) {
        if (scale.get() < 1.05) resetZoom();
        s.axis = '';
      }
      return;
    }
    const dx = e.clientX - s.startX;
    const dy = e.clientY - s.startY;
    const first = s.samples[0];
    const dt = Math.max(1, performance.now() - (first?.t ?? s.startT));
    const vx = first ? (e.clientX - first.x) / dt : 0; // px/ms
    const vy = first ? (e.clientY - first.y) / dt : 0;

    if (s.axis === 'x') {
      const i = indexRef.current;
      if ((dx < -size.w * 0.22 || vx < -0.45) && i < images.length - 1) goTo(i + 1, vx * 1000);
      else if ((dx > size.w * 0.22 || vx > 0.45) && i > 0) goTo(i - 1, vx * 1000);
      else animate(trackX, -i * (size.w + GAP), SPRING);
    } else if (s.axis === 'y') {
      if (Math.abs(dy) > 120 || Math.abs(vy) > 0.7) close(dy > 0 ? 1 : -1);
      else animate(dragY, 0, SPRING);
    } else if (!s.axis && Math.abs(dx) < 8 && Math.abs(dy) < 8 && performance.now() - s.startT < 300) {
      handleTap(e.clientX, e.clientY);
    }
    s.axis = '';
  };

  const handleTap = (x: number, y: number) => {
    const s = g.current;
    const now = performance.now();
    if (now - s.lastTap < 300) {
      window.clearTimeout(s.tapTimer);
      s.lastTap = 0;
      if (zoomed) {
        resetZoom();
      } else {
        const k = 2.5;
        setZoomed(true);
        animate(scale, k, SPRING);
        animate(panX, (size.w / 2 - x) * (k - 1), SPRING);
        animate(panY, (size.h / 2 - y) * (k - 1), SPRING);
      }
      return;
    }
    s.lastTap = now;
    s.tapTimer = window.setTimeout(() => setShowUI(v => !v), 280);
  };

  const current = images[index];
  const slots = useMemo(() => [index - 1, index, index + 1].filter(i => i >= 0 && i < images.length), [index, images.length]);

  if (!current) return null;
  const favorited = favoriteIds.has(current.id);

  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: current.title || 'PicStroom', url: current.sourceUrl });
      else await navigator.clipboard.writeText(current.sourceUrl);
    } catch { /* cancelled */ }
  };

  return (
    <motion.div
      className="ps-viewer"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.14 }}
      data-testid="viewer"
      data-index={index}
      data-image-id={images[index]?.id}
    >
      <motion.div className="ps-viewer-bg" style={{ opacity: bgOpacity }} />
      <div
        className="ps-viewer-stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <motion.div className="ps-viewer-track" style={{ x: trackX, y: dragY }}>
          {slots.map(i => (
            <Slot
              key={images[i].id}
              image={images[i]}
              left={i * (size.w + GAP)}
              width={size.w}
              sources={sourcesFor(images[i])}
              placeholder={cellSources(images[i], thumbBucket(size.w / 2, window.devicePixelRatio), useProxy)[0]}
              active={i === index}
              scale={scale}
              panX={panX}
              panY={panY}
            />
          ))}
        </motion.div>
      </div>

      <div className={showUI ? 'ps-viewer-ui' : 'ps-viewer-ui ps-hidden'}>
        <header className="ps-viewer-top">
          <button className="ps-icon-btn" onClick={() => close()} aria-label="Close viewer">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="square" d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
          <span className="ps-viewer-count" data-testid="viewer-count">{index + 1} / {images.length}</span>
          <button className="ps-icon-btn" onClick={() => toggleFavorite(current)} aria-label={favorited ? 'Remove favorite' : 'Add favorite'}>
            <svg viewBox="0 0 24 24" fill={favorited ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.75} className={favorited ? 'text-yellow-400' : ''}>
              <path strokeLinejoin="miter" d="M11.48 3.5a.56.56 0 0 1 1.04 0l2.13 5.11a.56.56 0 0 0 .47.35l5.52.44c.5.04.7.66.32.99l-4.2 3.6a.56.56 0 0 0-.18.56l1.28 5.39a.56.56 0 0 1-.84.61L12.3 17.7a.56.56 0 0 0-.59 0l-4.72 2.84a.56.56 0 0 1-.84-.6l1.28-5.4a.56.56 0 0 0-.18-.55l-4.2-3.6a.56.56 0 0 1 .32-.99l5.52-.44a.56.56 0 0 0 .47-.35z" />
            </svg>
          </button>
        </header>
        <footer className="ps-viewer-bottom">
          {current.title && <p className="ps-viewer-title">{current.title}</p>}
          <div className="ps-viewer-actions">
            <button onClick={() => window.open(current.sourceUrl, '_blank', 'noopener,noreferrer')}>Source</button>
            <button onClick={share}>Share</button>
            <button onClick={() => window.open(current.url, '_blank', 'noopener,noreferrer')}>Original</button>
          </div>
        </footer>
      </div>
    </motion.div>
  );
}

interface SlotProps {
  image: FeedImage;
  left: number;
  width: number;
  sources: string[];
  placeholder: string;
  active: boolean;
  scale: MotionValue<number>;
  panX: MotionValue<number>;
  panY: MotionValue<number>;
}

const Slot = memo(function Slot({ image, left, width, sources, placeholder, active, scale, panX, panY }: SlotProps) {
  const [attempt, setAttempt] = useState(0);
  const src = sources[Math.min(attempt, sources.length - 1)];
  const [ready, setReady] = useState(() => decodedLarge.has(src));
  const [failed, setFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const el = imgRef.current;
    if (!el || ready) return;
    let cancelled = false;
    // decode() resolves once the bitmap is ready to paint: reveal without a blank frame.
    const reveal = () => {
      el.decode()
        .catch(() => undefined)
        .then(() => {
          if (cancelled) return;
          decodedLarge.add(src);
          setReady(true);
        });
    };
    if (el.complete && el.naturalWidth) reveal();
    else el.addEventListener('load', reveal, { once: true });
    return () => {
      cancelled = true;
      el.removeEventListener('load', reveal);
    };
  }, [src, ready]);

  return (
    <div className="ps-slot" style={{ left, width }} data-slot-id={image.id} data-active={active || undefined}>
      <motion.div
        className="ps-slot-inner"
        style={active ? { scale, x: panX, y: panY } : undefined}
      >
        {!ready && <img className="ps-slot-img ps-slot-ph" src={placeholder} crossOrigin={corsFor(placeholder)} alt="" draggable={false} />}
        {!failed && (
          <img
            ref={imgRef}
            key={src}
            className={ready ? 'ps-slot-img' : 'ps-slot-img ps-slot-loading'}
            src={src}
            alt={image.title || ''}
            draggable={false}
            decoding="async"
            onError={() => {
              if (attempt + 1 < sources.length) {
                setReady(false);
                setAttempt(attempt + 1);
              } else {
                setFailed(true);
                logDiag('warn', 'Viewer image failed', image.url);
              }
            }}
          />
        )}
        {failed && <div className="ps-slot-failed">Image unavailable</div>}
      </motion.div>
    </div>
  );
});
