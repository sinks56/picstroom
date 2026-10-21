import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useInView } from 'react-intersection-observer';
import type { FeedImage } from '../types';
import { useStore } from '../store';

interface MasonryGridProps {
  images: FeedImage[];
  onImageClick: (image: FeedImage, allImages: FeedImage[], index: number, feedId?: string) => void;
}

const BATCH_SIZE = 40;
const VIRTUALIZATION_BUFFER = 500; // pixels above/below viewport to render

interface LayoutItem {
  image: FeedImage;
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export function MasonryGrid({ images, onImageClick }: MasonryGridProps) {
  const { loadOlderPosts, loadingOlder, reachedEnd } = useStore();
  const [displayCount, setDisplayCount] = useState(BATCH_SIZE);
  const [containerWidth, setContainerWidth] = useState(0);
  const [layout, setLayout] = useState<LayoutItem[]>([]);
  const [containerHeight, setContainerHeight] = useState(0);
  const [scrollY, setScrollY] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const loadedAspectRatios = useRef<Map<string, number>>(new Map());
  const prevImagesLength = useRef(images.length);

  const { ref: bottomRef, inView: bottomInView } = useInView({
    threshold: 0,
    rootMargin: '400px'
  });

  const { ref: olderRef, inView: olderInView } = useInView({
    threshold: 0,
    rootMargin: '200px'
  });

  // Load more images when scrolling down
  useEffect(() => {
    if (bottomInView && displayCount < images.length) {
      setDisplayCount(prev => Math.min(prev + BATCH_SIZE, images.length));
    }
  }, [bottomInView, displayCount, images.length]);

  // Load older posts when reaching the end of current window
  useEffect(() => {
    if (olderInView && displayCount >= images.length && !loadingOlder && !reachedEnd) {
      loadOlderPosts();
    }
  }, [olderInView, displayCount, images.length, loadingOlder, reachedEnd, loadOlderPosts]);

  // Only reset displayCount when images actually shrink (feed removed), not when expanded
  useEffect(() => {
    if (images.length < prevImagesLength.current) {
      setDisplayCount(Math.min(displayCount, Math.max(BATCH_SIZE, images.length)));
    } else if (images.length > prevImagesLength.current && displayCount < BATCH_SIZE) {
      setDisplayCount(BATCH_SIZE);
    }
    prevImagesLength.current = images.length;
  }, [images.length, displayCount]);

  // Track scroll position for virtualization
  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.scrollY);
    };
    
    setViewportHeight(window.innerHeight);
    handleScroll();
    
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', () => setViewportHeight(window.innerHeight));
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', () => setViewportHeight(window.innerHeight));
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateWidth = () => {
      setContainerWidth(container.offsetWidth);
    };

    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(container);

    return () => observer.disconnect();
  }, []);

  const columnCount = useMemo(() => {
    if (containerWidth < 480) return 2;
    if (containerWidth < 768) return 3;
    if (containerWidth < 1024) return 4;
    return 5;
  }, [containerWidth]);

  const columnWidth = useMemo(() => {
    if (containerWidth === 0) return 0;
    return containerWidth / columnCount;
  }, [containerWidth, columnCount]);

  const displayedImages = useMemo(() => 
    images.slice(0, displayCount),
    [images, displayCount]
  );

  const calculateLayout = useCallback(() => {
    if (columnWidth === 0 || displayedImages.length === 0) {
      setLayout([]);
      setContainerHeight(0);
      return;
    }

    const columnHeights = new Array(columnCount).fill(0);
    const items: LayoutItem[] = [];

    displayedImages.forEach((image, index) => {
      const cachedRatio = loadedAspectRatios.current.get(image.id);
      const aspectRatio = cachedRatio || 1;
      const height = columnWidth / aspectRatio;

      const shortestColumn = columnHeights.indexOf(Math.min(...columnHeights));
      
      items.push({
        image,
        index,
        x: shortestColumn * columnWidth,
        y: columnHeights[shortestColumn],
        width: columnWidth,
        height
      });

      columnHeights[shortestColumn] += height;
    });

    setLayout(items);
    setContainerHeight(Math.max(...columnHeights));
  }, [columnWidth, columnCount, displayedImages]);

  useEffect(() => {
    calculateLayout();
  }, [calculateLayout]);

  const handleImageLoad = useCallback((imageId: string, aspectRatio: number) => {
    if (loadedAspectRatios.current.get(imageId) !== aspectRatio) {
      loadedAspectRatios.current.set(imageId, aspectRatio);
      calculateLayout();
    }
  }, [calculateLayout]);

  // Filter items to only render those in/near viewport (virtualization)
  const visibleItems = useMemo(() => {
    if (!containerRef.current) return layout;
    
    const containerTop = containerRef.current.offsetTop;
    const viewTop = scrollY - VIRTUALIZATION_BUFFER;
    const viewBottom = scrollY + viewportHeight + VIRTUALIZATION_BUFFER;
    
    return layout.filter(item => {
      const itemTop = containerTop + item.y;
      const itemBottom = itemTop + item.height;
      return itemBottom >= viewTop && itemTop <= viewBottom;
    });
  }, [layout, scrollY, viewportHeight]);

  if (images.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
        <svg className="w-12 h-12 text-[var(--color-text-muted)] mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
        </svg>
        <h3 className="text-base font-medium mb-1">No images yet</h3>
        <p className="text-[var(--color-text-muted)] text-sm">
          Add some feeds to start browsing
        </p>
      </div>
    );
  }

  return (
    <div className="pb-4">
      <div 
        ref={containerRef}
        className="relative w-full"
        style={{ height: containerHeight || 'auto' }}
      >
        {visibleItems.map((item) => (
          <MasonryItem
            key={item.image.id}
            item={item}
            onClick={() => onImageClick(item.image, images, item.index)}
            onLoad={handleImageLoad}
          />
        ))}
      </div>

      {/* Loading more from current batch */}
      {displayCount < images.length && (
        <div ref={bottomRef} className="flex justify-center py-4">
          <div className="flex items-center gap-2 text-[var(--color-text-muted)] text-sm">
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span>Loading...</span>
          </div>
        </div>
      )}

      {/* Loading older posts / end state */}
      {displayCount >= images.length && (
        <div ref={olderRef} className="flex justify-center py-6">
          {loadingOlder ? (
            <div className="flex items-center gap-2 text-[var(--color-text-muted)] text-sm">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>Loading older posts...</span>
            </div>
          ) : reachedEnd ? (
            <div className="text-[var(--color-text-muted)] text-xs">
              No more posts
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

interface MasonryItemProps {
  item: LayoutItem;
  onClick: () => void;
  onLoad: (imageId: string, aspectRatio: number) => void;
}

function MasonryItem({ item, onClick, onLoad }: MasonryItemProps) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const aspectRatio = img.naturalWidth / img.naturalHeight;
    onLoad(item.image.id, aspectRatio);
    setLoaded(true);
  };

  if (error) return null;

  return (
    <div
      onClick={onClick}
      className="absolute overflow-hidden cursor-pointer bg-[var(--color-bg-tertiary)]"
      style={{
        left: item.x,
        top: item.y,
        width: item.width,
        height: item.height,
        transform: 'translateZ(0)',
        willChange: 'transform'
      }}
    >
      <img
        src={item.image.thumbnailUrl || item.image.url}
        alt={item.image.title || 'Image'}
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
