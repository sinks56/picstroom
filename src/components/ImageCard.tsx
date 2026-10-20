import { useState, useRef } from 'react';
import { useInView } from 'react-intersection-observer';
import type { FeedImage } from '../types';
import { useStore } from '../store';

interface ImageCardProps {
  image: FeedImage;
  onClick: () => void;
  aspectRatio?: 'square' | 'auto';
  size?: 'small' | 'medium' | 'large';
}

export function ImageCard({ image, onClick, aspectRatio = 'auto', size = 'medium' }: ImageCardProps) {
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

  const sizeClasses = {
    small: 'h-24 w-24',
    medium: 'h-40 w-auto min-w-32 max-w-80',
    large: 'h-56 w-auto min-w-40 max-w-[28rem]'
  };

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

  return (
    <div
      ref={ref}
      onClick={onClick}
      className={`
        relative overflow-hidden rounded-xl cursor-pointer
        bg-[var(--color-bg-tertiary)] flex-shrink-0 group
        transition-all duration-200
        hover:ring-2 hover:ring-[var(--color-accent)] hover:ring-offset-2 hover:ring-offset-[var(--color-bg-primary)]
        ${aspectRatio === 'square' ? 'aspect-square' : ''}
        ${size === 'small' ? sizeClasses.small : size === 'medium' ? sizeClasses.medium : sizeClasses.large}
      `}
      style={aspectRatio === 'auto' && loaded ? { 
        width: size === 'medium' ? `${Math.min(Math.max(naturalRatio * 160, 128), 320)}px` : 
               size === 'large' ? `${Math.min(Math.max(naturalRatio * 224, 160), 448)}px` : undefined
      } : undefined}
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
            transition-opacity duration-300
            ${loaded ? 'opacity-100' : 'opacity-0'}
          `}
        />
      )}

      {/* Loading placeholder */}
      {!loaded && !error && (
        <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-[var(--color-bg-tertiary)] to-[var(--color-bg-secondary)]" />
      )}

      {/* Favorite indicator */}
      {favorited && (
        <div className="absolute top-2 right-2 p-1 rounded-full bg-black/40 backdrop-blur-sm">
          <svg className="w-4 h-4 text-yellow-400 fill-current" viewBox="0 0 24 24">
            <path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
          </svg>
        </div>
      )}

      {/* Hover overlay with title */}
      {image.title && (
        <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
          <p className="text-white text-sm font-medium line-clamp-2">{image.title}</p>
        </div>
      )}
    </div>
  );
}
