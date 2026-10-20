import { useState, useEffect } from 'react';
import { useInView } from 'react-intersection-observer';
import type { FeedImage } from '../types';

interface MasonryGridProps {
  images: FeedImage[];
  onImageClick: (image: FeedImage, allImages: FeedImage[], index: number) => void;
}

const BATCH_SIZE = 40;

export function MasonryGrid({ images, onImageClick }: MasonryGridProps) {
  const [displayCount, setDisplayCount] = useState(BATCH_SIZE);

  const { ref: bottomRef, inView } = useInView({
    threshold: 0,
    rootMargin: '400px'
  });

  useEffect(() => {
    if (inView && displayCount < images.length) {
      setDisplayCount(prev => Math.min(prev + BATCH_SIZE, images.length));
    }
  }, [inView, displayCount, images.length]);

  useEffect(() => {
    setDisplayCount(BATCH_SIZE);
  }, [images]);

  const displayedImages = images.slice(0, displayCount);

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
      <div className="masonry-grid">
        {displayedImages.map((image, index) => (
          <div key={image.id} className="masonry-item">
            <MasonryItem
              image={image}
              onClick={() => onImageClick(image, images, index)}
            />
          </div>
        ))}
      </div>

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
    </div>
  );
}

interface MasonryItemProps {
  image: FeedImage;
  onClick: () => void;
}

function MasonryItem({ image, onClick }: MasonryItemProps) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);

  const { ref, inView } = useInView({
    threshold: 0,
    triggerOnce: true,
    rootMargin: '200px'
  });

  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setAspectRatio(img.naturalWidth / img.naturalHeight);
    setLoaded(true);
  };

  if (error) {
    return null;
  }

  return (
    <div
      ref={ref}
      onClick={onClick}
      className="relative overflow-hidden cursor-pointer bg-[var(--color-bg-tertiary)] group"
      style={{ 
        aspectRatio: aspectRatio ? `${aspectRatio}` : '4/3',
        minHeight: '80px'
      }}
    >
      {inView && (
        <img
          src={image.thumbnailUrl || image.url}
          alt={image.title || 'Image'}
          onLoad={handleLoad}
          onError={() => setError(true)}
          loading="lazy"
          decoding="async"
          className={`w-full h-full object-cover transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        />
      )}

      {!loaded && !error && (
        <div className="absolute inset-0 animate-pulse bg-[var(--color-bg-tertiary)]" />
      )}
    </div>
  );
}
