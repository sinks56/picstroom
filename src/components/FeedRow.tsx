import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import type { Feed, FeedImage } from '../types';
import { useStore } from '../store';

interface FeedRowProps {
  feed: Feed;
  images: FeedImage[];
  onImageClick: (image: FeedImage, allImages: FeedImage[], index: number, feedId?: string) => void;
  onManageFeed: () => void;
}

const ROW_HEIGHT = 140;
const VIRTUALIZATION_BUFFER = 400; // pixels left/right of viewport to render

export function FeedRow({ feed, images, onImageClick, onManageFeed }: FeedRowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { refreshFeed, loadingFeeds } = useStore();
  const isLoading = loadingFeeds.has(feed.id);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [imageWidths, setImageWidths] = useState<Map<string, number>>(new Map());

  const handleRefresh = (e: React.MouseEvent) => {
    e.stopPropagation();
    refreshFeed(feed.id);
  };

  // Track scroll position
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const handleScroll = () => {
      setScrollLeft(container.scrollLeft);
    };

    setContainerWidth(container.offsetWidth);
    container.addEventListener('scroll', handleScroll, { passive: true });

    const resizeObserver = new ResizeObserver(() => {
      setContainerWidth(container.offsetWidth);
    });
    resizeObserver.observe(container);

    return () => {
      container.removeEventListener('scroll', handleScroll);
      resizeObserver.disconnect();
    };
  }, []);

  const handleImageLoad = useCallback((imageId: string, width: number) => {
    setImageWidths(prev => {
      if (prev.get(imageId) === width) return prev;
      const next = new Map(prev);
      next.set(imageId, width);
      return next;
    });
  }, []);

  // Calculate positions and which items are visible
  const { visibleItems, totalWidth } = useMemo(() => {
    let x = 0;
    const items: { image: FeedImage; index: number; x: number; width: number }[] = [];
    
    images.forEach((image, index) => {
      const width = imageWidths.get(image.id) || ROW_HEIGHT;
      items.push({ image, index, x, width });
      x += width;
    });

    const viewStart = scrollLeft - VIRTUALIZATION_BUFFER;
    const viewEnd = scrollLeft + containerWidth + VIRTUALIZATION_BUFFER;

    const visible = items.filter(item => {
      const itemEnd = item.x + item.width;
      return itemEnd >= viewStart && item.x <= viewEnd;
    });

    return { visibleItems: visible, totalWidth: x };
  }, [images, imageWidths, scrollLeft, containerWidth]);

  if (images.length === 0 && !isLoading) {
    return (
      <div className="mb-2">
        <div className="flex items-center justify-between px-3 py-1">
          <button
            onClick={onManageFeed}
            className="flex items-center gap-1 text-left hover:opacity-80 transition-opacity"
          >
            <h2 className="text-sm font-medium">{feed.title}</h2>
            <svg className="w-3 h-3 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </div>
        <div className="px-3 py-4 text-center text-[var(--color-text-muted)] text-xs">
          <p>No images found</p>
          <button onClick={handleRefresh} className="mt-1 text-[var(--color-accent)]">
            Refresh
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-2">
      {/* Compact header */}
      <div className="flex items-center justify-between px-3 py-1">
        <button
          onClick={onManageFeed}
          className="flex items-center gap-1 text-left hover:opacity-80 transition-opacity"
        >
          <h2 className="text-sm font-medium">{feed.title}</h2>
          <span className="text-xs text-[var(--color-text-muted)]">
            {images.length}
          </span>
          <svg className="w-3 h-3 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
        
        <button
          onClick={handleRefresh}
          disabled={isLoading}
          className="p-1 hover:bg-[var(--color-bg-tertiary)] transition-colors disabled:opacity-50"
          aria-label="Refresh feed"
        >
          <svg 
            className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor" 
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
        </button>
      </div>

      {/* Virtualized Image Row */}
      <div 
        ref={scrollRef} 
        className="image-row relative"
        style={{ height: `${ROW_HEIGHT}px` }}
      >
        {isLoading && images.length === 0 ? (
          Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-full w-[140px] bg-[var(--color-bg-tertiary)] animate-pulse flex-shrink-0"
            />
          ))
        ) : (
          <div style={{ width: totalWidth, height: ROW_HEIGHT, position: 'relative' }}>
            {visibleItems.map((item) => (
              <VirtualizedImageCard
                key={item.image.id}
                image={item.image}
                x={item.x}
                onClick={() => onImageClick(item.image, images, item.index, feed.id)}
                onWidthKnown={handleImageLoad}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface VirtualizedImageCardProps {
  image: FeedImage;
  x: number;
  onClick: () => void;
  onWidthKnown: (imageId: string, width: number) => void;
}

function VirtualizedImageCard({ image, x, onClick, onWidthKnown }: VirtualizedImageCardProps) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [width, setWidth] = useState(ROW_HEIGHT);

  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const { naturalWidth, naturalHeight } = img;
    if (naturalWidth && naturalHeight) {
      const calculatedWidth = Math.round(ROW_HEIGHT * (naturalWidth / naturalHeight));
      setWidth(calculatedWidth);
      onWidthKnown(image.id, calculatedWidth);
    }
    setLoaded(true);
  };

  if (error) return null;

  return (
    <div
      onClick={onClick}
      className="absolute top-0 overflow-hidden cursor-pointer bg-[var(--color-bg-tertiary)]"
      style={{
        left: x,
        width: width,
        height: ROW_HEIGHT,
        transform: 'translateZ(0)'
      }}
    >
      <img
        src={image.thumbnailUrl || image.url}
        alt={image.title || 'Image'}
        onLoad={handleLoad}
        onError={() => setError(true)}
        loading="lazy"
        decoding="async"
        className={`w-full h-full object-cover transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0'}`}
      />

      {!loaded && !error && (
        <div className="absolute inset-0 animate-pulse bg-[var(--color-bg-tertiary)]" />
      )}
    </div>
  );
}
