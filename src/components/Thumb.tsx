import { memo, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import type { FeedImage } from '../types';
import { cellSources, loadedSources, thumbBucket, corsFor } from '../lib/thumbs';

interface ThumbProps {
  image: FeedImage;
  /** CSS width of the cell; picks the resized variant (DPR-aware, bucketed). */
  cssWidth: number;
  useProxy: boolean;
  style: CSSProperties;
  onOpen: (image: FeedImage) => void;
  onFail: (imageId: string) => void;
}

/**
 * One grid/row cell. The box size comes from the layout (stored aspect ratio), never from
 * the loaded image, so nothing shifts when pictures arrive. On error it walks the
 * fallback list (resized → srcset thumbnail → original); if all fail the parent collapses
 * the cell out of the layout.
 */
export const Thumb = memo(function Thumb({ image, cssWidth, useProxy, style, onOpen, onFail }: ThumbProps) {
  const variant = thumbBucket(cssWidth, window.devicePixelRatio);
  const sources = useMemo(() => cellSources(image, variant, useProxy), [image, variant, useProxy]);
  const [attempt, setAttempt] = useState(0);
  const src = sources[Math.min(attempt, sources.length - 1)];
  const [loaded, setLoaded] = useState(() => loadedSources.has(src));

  return (
    <div
      className="ps-cell"
      style={style}
      data-image-id={image.id}
      onClick={() => onOpen(image)}
    >
      <img
        key={src}
        src={src}
        crossOrigin={corsFor(src)}
        alt=""
        draggable={false}
        decoding="async"
        // Windowing already limits what is mounted; lazy loading would only add latency.
        loading="eager"
        className={loaded ? 'ps-img ps-img-in' : 'ps-img'}
        onLoad={() => {
          loadedSources.add(src);
          setLoaded(true);
        }}
        onError={() => {
          if (attempt + 1 < sources.length) {
            setLoaded(false);
            setAttempt(attempt + 1);
          } else {
            onFail(image.id);
          }
        }}
      />
    </div>
  );
});
