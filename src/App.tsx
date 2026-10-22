import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { App as CapacitorApp } from '@capacitor/app';
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
import { ErrorBoundary } from './components/ErrorBoundary';
import { filterByTimeWindow, capPerPost } from './lib/collections';
import { logDiag } from './lib/diagnostics';

interface ViewerState {
  images: FeedImage[];
  index: number;
  scrollY: number;
}

export default function App() {
  const initialized = useStore(s => s.initialized);
  const initialize = useStore(s => s.initialize);
  const viewMode = useStore(s => s.settings.viewMode);
  const maxPerPost = useStore(s => s.settings.maxPerPostInGrid ?? 6);
  const feeds = useStore(s => s.feeds);
  const imagesByFeed = useStore(s => s.imagesByFeed);
  const allImages = useStore(s => s.allImages);
  const multiplier = useStore(s => s.timeWindowMultiplier);
  const error = useStore(s => s.error);
  const clearError = useStore(s => s.clearError);
  const loadOlderPosts = useStore(s => s.loadOlderPosts);

  const [addFeedOpen, setAddFeedOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [favoritesOpen, setFavoritesOpen] = useState(false);
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const [manageFeed, setManageFeed] = useState<Feed | null>(null);
  const [viewer, setViewer] = useState<ViewerState | null>(null);
  const viewerIndexRef = useRef(0);

  // Recompute the time window when the clock crosses into a new hour, not on every render.
  const hourBucket = Math.floor(Date.now() / 3_600_000);
  const gridImages = useMemo(
    () => capPerPost(filterByTimeWindow(allImages, multiplier), maxPerPost),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allImages, multiplier, maxPerPost, hourBucket]
  );
  const rowImages = useMemo(() => {
    const out: Record<string, FeedImage[]> = {};
    for (const [id, imgs] of Object.entries(imagesByFeed)) out[id] = filterByTimeWindow(imgs, multiplier);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imagesByFeed, multiplier, hourBucket]);

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(clearError, 5000);
    return () => clearTimeout(t);
  }, [error, clearError]);

  // ---- Viewer + history -----------------------------------------------------------
  const openViewer = useCallback((_image: FeedImage, images: FeedImage[], index: number) => {
    viewerIndexRef.current = index;
    setViewer({ images, index, scrollY: window.scrollY });
    history.pushState({ picstroom: 'viewer' }, '');
  }, []);

  /** Close without touching history (popstate already happened, or there is no entry). */
  const finishClose = useCallback(() => {
    setViewer(prev => {
      if (!prev) return prev;
      const last = prev.images[viewerIndexRef.current];
      const y = prev.scrollY;
      // Restore once the viewer (and its scroll lock) is gone, then make sure the last
      // picture viewed is visible.
      requestAnimationFrame(() => {
        window.scrollTo(0, y);
        if (last) window.dispatchEvent(new CustomEvent('picstroom:reveal', { detail: { imageId: last.id } }));
      });
      return null;
    });
  }, []);

  const closeViewer = useCallback(() => {
    if (history.state?.picstroom === 'viewer') history.back(); // popstate → finishClose
    else finishClose();
  }, [finishClose]);

  useEffect(() => {
    if (!history.state) history.replaceState({ picstroom: 'main' }, '');
    const onPop = () => finishClose();
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [finishClose]);

  // ---- Android back button: viewer → modal → minimize ---------------------------------
  const stateRef = useRef({ viewer, addFeedOpen, settingsOpen, favoritesOpen, discoverOpen, manageFeed });
  stateRef.current = { viewer, addFeedOpen, settingsOpen, favoritesOpen, discoverOpen, manageFeed };
  useEffect(() => {
    let remove: (() => void) | undefined;
    let disposed = false;
    CapacitorApp.addListener('backButton', () => {
      const s = stateRef.current;
      if (s.viewer) return closeViewer();
      if (s.manageFeed) return setManageFeed(null);
      if (s.addFeedOpen) return setAddFeedOpen(false);
      if (s.settingsOpen) return setSettingsOpen(false);
      if (s.favoritesOpen) return setFavoritesOpen(false);
      if (s.discoverOpen) return setDiscoverOpen(false);
      CapacitorApp.minimizeApp().catch(() => CapacitorApp.exitApp());
    })
      .then(h => {
        if (disposed) h.remove();
        else remove = () => h.remove();
      })
      .catch(e => logDiag('info', 'backButton listener unavailable', e));
    return () => {
      disposed = true;
      remove?.();
    };
  }, [closeViewer]);

  const onManageFeed = useCallback((feed: Feed) => setManageFeed(feed), []);
  const onRowEnd = useCallback(() => loadOlderPosts(), [loadOlderPosts]);

  if (!initialized) {
    return <div className="ps-splash"><span className="ps-spinner" /></div>;
  }

  return (
    <div className="ps-app">
      <Header
        onAddFeed={() => setAddFeedOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenFavorites={() => setFavoritesOpen(true)}
        onOpenDiscover={() => setDiscoverOpen(true)}
      />

      {error && (
        <div className="ps-toast" role="status" onClick={clearError}>
          {error}
        </div>
      )}

      <main className="ps-main">
        {feeds.length === 0 ? (
          <EmptyState onAddFeed={() => setAddFeedOpen(true)} onDiscover={() => setDiscoverOpen(true)} />
        ) : viewMode === 'rows' ? (
          <div className="ps-rows">
            {feeds.map(feed => (
              <FeedRow
                key={feed.id}
                feed={feed}
                images={rowImages[feed.id] || []}
                onImageClick={openViewer}
                onManageFeed={onManageFeed}
                onNearEnd={onRowEnd}
              />
            ))}
          </div>
        ) : (
          <MasonryGrid images={gridImages} onImageClick={openViewer} />
        )}
      </main>

      <AddFeedModal isOpen={addFeedOpen} onClose={() => setAddFeedOpen(false)} />
      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <FavoritesModal isOpen={favoritesOpen} onClose={() => setFavoritesOpen(false)} onImageClick={openViewer} />
      <DiscoverModal isOpen={discoverOpen} onClose={() => setDiscoverOpen(false)} />
      <FeedManageModal feed={manageFeed} isOpen={!!manageFeed} onClose={() => setManageFeed(null)} />

      <ErrorBoundary label="Viewer" onReset={finishClose}>
        <AnimatePresence>
          {viewer && (
            <ImageViewer
              key="viewer"
              images={viewer.images}
              initialIndex={viewer.index}
              onClose={closeViewer}
              onIndexChange={i => { viewerIndexRef.current = i; }}
            />
          )}
        </AnimatePresence>
      </ErrorBoundary>
    </div>
  );
}
