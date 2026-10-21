import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useStore } from './store';
import type { Feed, FeedImage } from './types';
import { Header } from './components/Header';
import { FeedRow } from './components/FeedRow';
import { MasonryGrid } from './components/MasonryGrid';
import { ImageViewer } from './components/ImageViewer';
import { AddFeedModal } from './components/AddFeedModal';
import { SettingsModal } from './components/SettingsModal';
import { FavoritesModal } from './components/FavoritesModal';
import { DiscoverModal } from './components/DiscoverModal';
import { FeedManageModal } from './components/FeedManageModal';
import { EmptyState } from './components/EmptyState';

type ViewState = 
  | { type: 'main' }
  | { type: 'viewer'; images: FeedImage[]; index: number; fromFeedId?: string };

export default function App() {
  const { initialized, initialize, settings, feeds, filteredImagesByFeed, filteredAllImages, error, clearError } = useStore();
  
  const [addFeedOpen, setAddFeedOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [favoritesOpen, setFavoritesOpen] = useState(false);
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const [manageFeed, setManageFeed] = useState<Feed | null>(null);
  const [viewState, setViewState] = useState<ViewState>({ type: 'main' });

  const imagesByFeed = filteredImagesByFeed();
  const allImages = filteredAllImages();

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    if (error) {
      const timeout = setTimeout(clearError, 5000);
      return () => clearTimeout(timeout);
    }
  }, [error, clearError]);

  // Handle browser back button / gesture
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      const state = e.state;
      if (state?.type === 'viewer') {
        setViewState(state);
      } else {
        setViewState({ type: 'main' });
      }
    };

    window.addEventListener('popstate', handlePopState);
    
    // Push initial state if not present
    if (!history.state) {
      history.replaceState({ type: 'main' }, '');
    }

    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleImageClick = useCallback((_image: FeedImage, images: FeedImage[], index: number, feedId?: string) => {
    const newState: ViewState = { type: 'viewer', images, index, fromFeedId: feedId };
    setViewState(newState);
    history.pushState(newState, '');
  }, []);

  const handleCloseViewer = useCallback(() => {
    setViewState({ type: 'main' });
    // Go back in history if we can, otherwise just update state
    if (history.state?.type === 'viewer') {
      history.back();
    }
  }, []);

  if (!initialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg-primary)]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center animate-pulse">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
            </svg>
          </div>
          <span className="text-[var(--color-text-muted)]">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)]">
      <Header
        onAddFeed={() => setAddFeedOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenFavorites={() => setFavoritesOpen(true)}
        onOpenDiscover={() => setDiscoverOpen(true)}
      />

      {/* Error toast */}
      <AnimatePresence>
        {error && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 animate-slide-up">
            <div className="px-4 py-3 rounded-xl bg-red-500 text-white shadow-lg flex items-center gap-3">
              <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              <span>{error}</span>
              <button onClick={clearError} className="ml-2 p-1 hover:bg-white/20 rounded">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* Main content */}
      <main className="pb-8">
        {feeds.length === 0 ? (
          <EmptyState
            onAddFeed={() => setAddFeedOpen(true)}
            onDiscover={() => setDiscoverOpen(true)}
          />
        ) : settings.viewMode === 'rows' ? (
          <div className="pt-4">
            {feeds.map((feed) => (
              <FeedRow
                key={feed.id}
                feed={feed}
                images={imagesByFeed[feed.id] || []}
                onImageClick={handleImageClick}
                onManageFeed={() => setManageFeed(feed)}
              />
            ))}
          </div>
        ) : (
          <div className="pt-4">
            <MasonryGrid
              images={allImages}
              onImageClick={handleImageClick}
            />
          </div>
        )}
      </main>

      {/* Modals */}
      <AddFeedModal
        isOpen={addFeedOpen}
        onClose={() => setAddFeedOpen(false)}
      />

      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />

      <FavoritesModal
        isOpen={favoritesOpen}
        onClose={() => setFavoritesOpen(false)}
        onImageClick={handleImageClick}
      />

      <DiscoverModal
        isOpen={discoverOpen}
        onClose={() => setDiscoverOpen(false)}
      />

      <FeedManageModal
        feed={manageFeed}
        isOpen={!!manageFeed}
        onClose={() => setManageFeed(null)}
      />

      {/* Full-screen image viewer */}
      <AnimatePresence>
        {viewState.type === 'viewer' && (
          <ImageViewer
            images={viewState.images}
            initialIndex={viewState.index}
            onClose={handleCloseViewer}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
