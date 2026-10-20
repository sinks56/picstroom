import { useState, useRef } from 'react';
import { useInView } from 'react-intersection-observer';
import type { FeedImage } from '../types';
import { useStore } from '../store';

interface ImageCardProps {
  image: FeedImage;
  onClick: () => void;
  size?: 'small' | 'medium' | 'large';
}

export function ImageCard({ image, onClick, size = 'medium' }: ImageCardProps) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [naturalRatio, setNaturalRatio] = useState(1);
  const imgRef = useRef<HTMLImageElement>(null);
  const { isFavorited } = useStore();
  const favorited = isFavorited(image.id);

  const { ref, inView } = useInView({
    threshold: 0,
    triggerOnce: true,
    rootMargin: '200px'
  });

  const heights = {
    small: 96,
    medium: 140,
    large: 180
  };

  const height = heights[size];

  const handleLoad = () => {
    setLoaded(true);
    if (imgRef.current) {
      const { naturalWidth, naturalHeight } = imgRef.current;
      if (naturalWidth && naturalHeight) {
        setNaturalRatio(naturalWidth / naturalHeight);
      }
    }
  };

  const handleError = () => {
    setError(true);
  };

  if (error) {
    return null;
  }

  const width = Math.round(height * naturalRatio);

  return (
    <div
      ref={ref}
      onClick={onClick}
      className="relative overflow-hidden cursor-pointer bg-[var(--color-bg-tertiary)] flex-shrink-0 group"
      style={{ 
        height: `${height}px`,
        width: loaded ? `${width}px` : `${height}px`
      }}
    >
      {inView && (
        <img
          ref={imgRef}
          src={image.thumbnailUrl || image.url}
          alt={image.title || 'Image'}
          onLoad={handleLoad}
          onError={handleError}
          loading="lazy"
          decoding="async"
          className={`
            w-full h-full object-cover
            transition-opacity duration-200
            ${loaded ? 'opacity-100' : 'opacity-0'}
          `}
        />
      )}

      {!loaded && !error && (
        <div className="absolute inset-0 animate-pulse bg-[var(--color-bg-tertiary)]" />
      )}

      {favorited && (
        <div className="absolute top-1 right-1 p-0.5 rounded-full bg-black/40">
          <svg className="w-3 h-3 text-yellow-400 fill-current" viewBox="0 0 24 24">
            <path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
          </svg>
        </div>
      )}
    </div>
  );
}
