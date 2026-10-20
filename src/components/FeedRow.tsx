import { useRef } from 'react';
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

  const handleRefresh = (e: React.MouseEvent) => {
    e.stopPropagation();
    refreshFeed(feed.id);
  };

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

      {/* Image Row - NO gaps, edge to edge */}
      <div ref={scrollRef} className="image-row">
        {isLoading && images.length === 0 ? (
          Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-[140px] w-[140px] bg-[var(--color-bg-tertiary)] animate-pulse flex-shrink-0"
            />
          ))
        ) : (
          images.map((image, index) => (
            <ImageCard
              key={image.id}
              image={image}
              onClick={() => onImageClick(image, images, index)}
              size="medium"
            />
          ))
        )}
      </div>
    </div>
  );
}
