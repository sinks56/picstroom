import { useRef, useState } from 'react';
import type { Feed, FeedImage } from '../types';
import { useStore } from '../store';
import { ImageCard } from './ImageCard';

interface FeedRowProps {
  feed: Feed;
  images: FeedImage[];
  onImageClick: (image: FeedImage, allImages: FeedImage[], index: number) => void;
  onManageFeed: () => void;
}

export function FeedRow({ feed, images, onImageClick, onManageFeed }: FeedRowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { refreshFeed, loadingFeeds } = useStore();
  const isLoading = loadingFeeds.has(feed.id);
  const [showScrollButtons, setShowScrollButtons] = useState(false);

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const scrollAmount = scrollRef.current.clientWidth * 0.8;
    scrollRef.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth'
    });
  };

  const handleRefresh = (e: React.MouseEvent) => {
    e.stopPropagation();
    refreshFeed(feed.id);
  };

  if (images.length === 0 && !isLoading) {
    return (
      <div className="mb-6">
        <div className="flex items-center justify-between px-4 mb-3">
          <button
            onClick={onManageFeed}
            className="flex items-center gap-2 text-left hover:opacity-80 transition-opacity"
          >
            <h2 className="text-lg font-semibold">{feed.title}</h2>
            <svg className="w-4 h-4 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </div>
        <div className="px-4 py-8 text-center text-[var(--color-text-muted)]">
          <p>No images found in this feed</p>
          <button
            onClick={handleRefresh}
            className="mt-2 text-[var(--color-accent)] hover:underline"
          >
            Try refreshing
          </button>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="mb-6 relative"
      onMouseEnter={() => setShowScrollButtons(true)}
      onMouseLeave={() => setShowScrollButtons(false)}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 mb-3">
        <button
          onClick={onManageFeed}
          className="flex items-center gap-2 text-left hover:opacity-80 transition-opacity"
        >
          <h2 className="text-lg font-semibold">{feed.title}</h2>
          <span className="text-sm text-[var(--color-text-muted)]">
            {images.length} image{images.length !== 1 ? 's' : ''}
          </span>
          <svg className="w-4 h-4 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
        
        <button
          onClick={handleRefresh}
          disabled={isLoading}
          className="p-1.5 rounded-lg hover:bg-[var(--color-bg-tertiary)] transition-colors disabled:opacity-50"
          aria-label="Refresh feed"
        >
          <svg 
            className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor" 
            strokeWidth={1.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
        </button>
      </div>

      {/* Image Row */}
      <div className="relative">
        {/* Scroll buttons */}
        {showScrollButtons && images.length > 3 && (
          <>
            <button
              onClick={() => scroll('left')}
              className="absolute left-2 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-[var(--color-bg-primary)]/90 shadow-lg hover:bg-[var(--color-bg-secondary)] transition-all opacity-0 hover:opacity-100 focus:opacity-100 group-hover:opacity-80"
              aria-label="Scroll left"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </button>
            <button
              onClick={() => scroll('right')}
              className="absolute right-2 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-[var(--color-bg-primary)]/90 shadow-lg hover:bg-[var(--color-bg-secondary)] transition-all opacity-0 hover:opacity-100 focus:opacity-100 group-hover:opacity-80"
              aria-label="Scroll right"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          </>
        )}

        <div
          ref={scrollRef}
          className="image-row"
        >
          {isLoading && images.length === 0 ? (
            // Loading placeholders
            Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-40 w-48 rounded-xl bg-[var(--color-bg-tertiary)] animate-pulse flex-shrink-0"
              />
            ))
          ) : (
            images.map((image, index) => (
              <ImageCard
                key={image.id}
                image={image}
                onClick={() => onImageClick(image, images, index)}
                size="large"
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
