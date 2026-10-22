import { create } from 'zustand';
import { v4 as uuid } from 'uuid';
import type { Feed, FeedImage, Folder, FavoriteImage, Settings } from '../types';
import {
  initDB,
  getSettings,
  saveSettings,
  getFeeds,
  saveFeed,
  deleteFeed as deleteFeedFromDB,
  getAllImages,
  upsertImages,
  deleteImages,
  getFolders,
  saveFolder,
  deleteFolder as deleteFolderFromDB,
  getFavorites,
  addFavorite,
  removeFavorite,
  DEFAULT_SETTINGS
} from '../lib/storage';
import { fetchWithCorsProxy } from '../lib/cors-proxy';
import { parseFeed, discoverFeedUrl, isFeedUrl } from '../lib/feed-parser';
import {
  buildFeedImages,
  mergeImages,
  pruneImages,
  sortByDateDesc,
  nextMultiplierRevealingOlder,
  buildPagedUrl,
  pagingState,
  applyPageOutcome,
  runLimited,
  type PageOutcome
} from '../lib/collections';
import { logDiag } from '../lib/diagnostics';

export type OlderStatus = 'idle' | 'loading' | 'waiting' | 'end';

interface AppState {
  initialized: boolean;
  initError: string | null;
  settings: Settings;
  feeds: Feed[];
  folders: Folder[];
  favorites: FavoriteImage[];
  favoriteIds: Set<string>;
  /** Per feed, newest first. */
  imagesByFeed: Record<string, FeedImage[]>;
  /** All feeds, newest first. */
  allImages: FeedImage[];
  loadingFeeds: Set<string>;
  refreshProgress: { done: number; total: number } | null;
  error: string | null;

  /** Visible time window, in 14-day chunks. */
  timeWindowMultiplier: number;
  olderStatus: OlderStatus;

  initialize: () => Promise<void>;
  updateSettings: (settings: Partial<Settings>) => Promise<void>;
  loadOlderPosts: (opts?: { force?: boolean }) => Promise<void>;

  addFeed: (urlOrFeedUrl: string, customTitle?: string) => Promise<Feed | null>;
  updateFeed: (feedId: string, updates: Partial<Feed>) => Promise<void>;
  removeFeed: (feedId: string) => Promise<void>;
  refreshFeed: (feedId: string) => Promise<void>;
  refreshAllFeeds: () => Promise<void>;
  reorderFeed: (feedId: string, newIndex: number) => Promise<void>;

  addFolder: (name: string) => Promise<Folder>;
  updateFolder: (folderId: string, updates: Partial<Folder>) => Promise<void>;
  removeFolder: (folderId: string) => Promise<void>;
  toggleFolderCollapsed: (folderId: string) => Promise<void>;

  toggleFavorite: (image: FeedImage) => Promise<void>;
  isFavorited: (imageId: string) => boolean;

  clearError: () => void;
}

function applyTheme(theme: Settings['theme']) {
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

function rebuildAll(imagesByFeed: Record<string, FeedImage[]>): FeedImage[] {
  // Each feed is already deduplicated; cross-feed duplicates are rare and harmless.
  return sortByDateDesc(Object.values(imagesByFeed).flat());
}

export const useStore = create<AppState>((set, get) => {
  /**
   * Merge freshly fetched images into a feed: in-memory state first (so the UI updates),
   * then persist only new/changed records and drop the overflow beyond the per-feed cap.
   */
  async function mergeIntoFeed(feedId: string, incoming: FeedImage[]): Promise<number> {
    const existing = get().imagesByFeed[feedId] || [];
    const { merged, changed, added } = mergeImages(existing, incoming);
    if (!changed.length) return 0;
    const { kept, pruned } = pruneImages(merged);
    const prunedIds = new Set(pruned.map(p => p.id));
    set(state => {
      if (!state.feeds.some(f => f.id === feedId)) return {}; // removed meanwhile
      const imagesByFeed = { ...state.imagesByFeed, [feedId]: kept };
      return { imagesByFeed, allImages: rebuildAll(imagesByFeed) };
    });
    try {
      await upsertImages(changed.filter(c => !prunedIds.has(c.id)));
      await deleteImages(pruned.filter(p => existing.some(e => e.id === p.id)).map(p => p.id));
    } catch (e) {
      logDiag('error', 'Saving images failed', e);
    }
    return added;
  }

  let retryTimer: number | undefined;
  /** When paging is in backoff, flip back to 'idle' once the earliest retry is due. */
  function scheduleRetry() {
    if (retryTimer) clearTimeout(retryTimer);
    const now = Date.now();
    const due = get().feeds.map(f => f.nextPageRetryAt || 0).filter(t => t > now);
    const wait = due.length ? Math.min(...due) - now + 50 : 30_000;
    retryTimer = window.setTimeout(() => {
      retryTimer = undefined;
      if (get().olderStatus === 'waiting') set({ olderStatus: 'idle' });
    }, wait);
  }

  async function fetchParsed(url: string) {
    const { settings } = get();
    const result = await fetchWithCorsProxy(url, settings.proxyList, settings.customProxyUrl);
    if (!result.ok || !result.text) return { ok: false as const, error: result.error || 'Failed to fetch' };
    // Parsing a large feed is synchronous; give the frame a chance to render first.
    await new Promise(r => setTimeout(r, 0));
    const parsed = parseFeed(result.text);
    if (!parsed) return { ok: false as const, error: 'Failed to parse feed' };
    return { ok: true as const, parsed };
  }

  return {
    initialized: false,
    initError: null,
    settings: DEFAULT_SETTINGS,
    feeds: [],
    folders: [],
    favorites: [],
    favoriteIds: new Set(),
    imagesByFeed: {},
    allImages: [],
    loadingFeeds: new Set(),
    refreshProgress: null,
    error: null,
    timeWindowMultiplier: 1,
    olderStatus: 'idle',

    initialize: async () => {
      try {
        await initDB();
        const [settings, feeds, folders, favorites, images] = await Promise.all([
          getSettings(),
          getFeeds(),
          getFolders(),
          getFavorites(),
          getAllImages()
        ]);

        const feedIds = new Set(feeds.map(f => f.id));
        const grouped: Record<string, FeedImage[]> = {};
        const orphanIds: string[] = [];
        for (const img of images) {
          if (!feedIds.has(img.feedId)) { orphanIds.push(img.id); continue; }
          (grouped[img.feedId] ||= []).push(img);
        }
        const imagesByFeed: Record<string, FeedImage[]> = {};
        const prunedIds: string[] = [];
        for (const feed of feeds) {
          const { kept, pruned } = pruneImages(grouped[feed.id] || []);
          imagesByFeed[feed.id] = kept;
          prunedIds.push(...pruned.map(p => p.id));
        }

        set({
          initialized: true,
          settings,
          feeds,
          folders,
          favorites,
          favoriteIds: new Set(favorites.map(f => f.imageId)),
          imagesByFeed,
          allImages: rebuildAll(imagesByFeed)
        });
        applyTheme(settings.theme);

        if (orphanIds.length || prunedIds.length) {
          // Housekeeping off the critical path.
          setTimeout(() => {
            deleteImages([...orphanIds, ...prunedIds]).catch(e => logDiag('warn', 'Prune failed', e));
          }, 3000);
        }
      } catch (error) {
        logDiag('error', 'Failed to initialize', error);
        set({ initialized: true, initError: error instanceof Error ? error.message : String(error), error: 'Failed to load saved data' });
      }
    },

    updateSettings: async (updates) => {
      const newSettings = { ...get().settings, ...updates };
      set({ settings: newSettings });
      applyTheme(newSettings.theme);
      try {
        await saveSettings(newSettings);
      } catch (e) {
        logDiag('error', 'Saving settings failed', e);
      }
    },

    loadOlderPosts: async (opts) => {
      const { olderStatus } = get();
      if (olderStatus === 'loading') return;
      set({ olderStatus: 'loading' });
      const force = !!opts?.force;

      try {
        // 1. Reveal stored images beyond the window (jumping over empty fortnights).
        const reveal = nextMultiplierRevealingOlder(get().allImages, get().timeWindowMultiplier);
        if (reveal !== null) {
          set({ timeWindowMultiplier: reveal, olderStatus: 'idle' });
          return;
        }

        // 2. Fetch the next archive page of each eligible feed.
        const now = Date.now();
        const feeds = get().feeds;
        const eligible = feeds.filter(f => {
          const st = pagingState(f, now);
          return st === 'eligible' || (force && st === 'backoff');
        });
        if (!eligible.length) {
          const waiting = feeds.some(f => pagingState(f, now) === 'backoff');
          set({ olderStatus: waiting ? 'waiting' : 'end' });
          if (waiting) scheduleRetry();
          return;
        }

        await runLimited(eligible, 3, async feed => {
          const page = (feed.lastFetchedPage || 1) + 1;
          let outcome: PageOutcome;
          try {
            const res = await fetchParsed(buildPagedUrl(feed.url, page));
            if (!res.ok) {
              outcome = { kind: 'failed' };
            } else if (!res.parsed.items.length) {
              outcome = { kind: 'empty' };
            } else {
              const added = await mergeIntoFeed(feed.id, buildFeedImages(res.parsed, feed));
              // A feed that ignores ?paged= returns page 1 again: nothing new means the end.
              outcome = added > 0 ? { kind: 'added', page } : { kind: 'empty' };
            }
          } catch (e) {
            logDiag('warn', `Paging ${feed.title} p${page} failed`, e);
            outcome = { kind: 'failed' };
          }
          const current = get().feeds.find(f => f.id === feed.id);
          if (current) await get().updateFeed(feed.id, applyPageOutcome(current, outcome));
        });

        const after = nextMultiplierRevealingOlder(get().allImages, get().timeWindowMultiplier);
        if (after !== null) {
          set({ timeWindowMultiplier: after, olderStatus: 'idle' });
          return;
        }
        const t = Date.now();
        const states = get().feeds.map(f => pagingState(f, t));
        const status: OlderStatus = states.includes('eligible') ? 'idle' : states.includes('backoff') ? 'waiting' : 'end';
        set({ olderStatus: status });
        if (status === 'waiting') scheduleRetry();
      } catch (e) {
        logDiag('error', 'loadOlderPosts failed', e);
        set({ olderStatus: 'waiting' });
        scheduleRetry();
      }
    },

    addFeed: async (urlOrFeedUrl, customTitle) => {
      const { settings } = get();
      let feedUrl = urlOrFeedUrl.trim();
      if (!/^https?:\/\//i.test(feedUrl)) feedUrl = 'https://' + feedUrl;

      try {
        if (!isFeedUrl(feedUrl)) {
          const result = await fetchWithCorsProxy(feedUrl, settings.proxyList, settings.customProxyUrl);
          if (result.ok && result.text) {
            const discoveredUrl = await discoverFeedUrl(result.text, feedUrl);
            if (discoveredUrl) feedUrl = discoveredUrl;
          }
        }
        if (get().feeds.some(f => f.url === feedUrl)) {
          set({ error: 'This feed has already been added.' });
          return null;
        }

        const res = await fetchParsed(feedUrl);
        if (!res.ok) {
          set({ error: res.error.startsWith('Failed to parse') ? 'Could not parse feed. Make sure the URL points to a valid RSS or Atom feed.' : `Failed to fetch feed: ${res.error}` });
          return null;
        }
        if (get().feeds.some(f => f.url === feedUrl)) return null; // added concurrently

        const feed: Feed = {
          id: uuid(),
          url: feedUrl,
          title: customTitle || res.parsed.title || 'Untitled Feed',
          siteUrl: res.parsed.siteUrl,
          description: res.parsed.description,
          order: get().feeds.length,
          lastFetched: Date.now()
        };
        await saveFeed(feed);
        set(state => ({
          feeds: [...state.feeds, feed],
          imagesByFeed: { ...state.imagesByFeed, [feed.id]: [] },
          olderStatus: 'idle'
        }));
        await mergeIntoFeed(feed.id, buildFeedImages(res.parsed, feed));
        return feed;
      } catch (error) {
        logDiag('error', 'Error adding feed', error);
        set({ error: 'Failed to add feed. Please check the URL and try again.' });
        return null;
      }
    },

    updateFeed: async (feedId, updates) => {
      const feed = get().feeds.find(f => f.id === feedId);
      if (!feed) return;
      const updatedFeed = { ...feed, ...updates };
      set(state => ({ feeds: state.feeds.map(f => (f.id === feedId ? updatedFeed : f)) }));
      try {
        await saveFeed(updatedFeed);
      } catch (e) {
        logDiag('error', 'Saving feed failed', e);
      }
    },

    removeFeed: async (feedId) => {
      set(state => {
        const imagesByFeed = { ...state.imagesByFeed };
        delete imagesByFeed[feedId];
        return {
          feeds: state.feeds.filter(f => f.id !== feedId),
          imagesByFeed,
          allImages: state.allImages.filter(img => img.feedId !== feedId)
        };
      });
      try {
        await deleteFeedFromDB(feedId);
      } catch (e) {
        logDiag('error', 'Deleting feed failed', e);
      }
    },

    refreshFeed: async (feedId) => {
      const feed = get().feeds.find(f => f.id === feedId);
      if (!feed || get().loadingFeeds.has(feedId)) return;
      set(state => ({ loadingFeeds: new Set([...state.loadingFeeds, feedId]) }));
      try {
        const res = await fetchParsed(feed.url);
        if (!res.ok) {
          await get().updateFeed(feedId, { errorMessage: res.error });
          return;
        }
        await mergeIntoFeed(feedId, buildFeedImages(res.parsed, feed));
        await get().updateFeed(feedId, { lastFetched: Date.now(), errorMessage: undefined });
      } catch (error) {
        logDiag('warn', `Refresh ${feed.title} failed`, error);
        await get().updateFeed(feedId, { errorMessage: 'Refresh failed' });
      } finally {
        set(state => {
          const next = new Set(state.loadingFeeds);
          next.delete(feedId);
          return { loadingFeeds: next };
        });
      }
    },

    refreshAllFeeds: async () => {
      if (get().refreshProgress) return;
      const feeds = get().feeds;
      if (!feeds.length) return;
      set({ refreshProgress: { done: 0, total: feeds.length }, olderStatus: 'idle' });
      try {
        await runLimited(feeds, 3, async f => {
          await get().refreshFeed(f.id);
          set(state => ({
            refreshProgress: state.refreshProgress && { ...state.refreshProgress, done: state.refreshProgress.done + 1 }
          }));
        });
      } finally {
        set({ refreshProgress: null });
      }
    },

    reorderFeed: async (feedId, newIndex) => {
      const { feeds } = get();
      const currentIndex = feeds.findIndex(f => f.id === feedId);
      if (currentIndex === -1 || currentIndex === newIndex) return;
      const newFeeds = [...feeds];
      const [removed] = newFeeds.splice(currentIndex, 1);
      newFeeds.splice(newIndex, 0, removed);
      for (let i = 0; i < newFeeds.length; i++) {
        newFeeds[i] = { ...newFeeds[i], order: i };
      }
      set({ feeds: newFeeds });
      for (const f of newFeeds) await saveFeed(f);
    },

    addFolder: async (name) => {
      const folder: Folder = { id: uuid(), name, order: get().folders.length, collapsed: false };
      await saveFolder(folder);
      set(state => ({ folders: [...state.folders, folder] }));
      return folder;
    },

    updateFolder: async (folderId, updates) => {
      const folder = get().folders.find(f => f.id === folderId);
      if (!folder) return;
      const updatedFolder = { ...folder, ...updates };
      await saveFolder(updatedFolder);
      set(state => ({ folders: state.folders.map(f => (f.id === folderId ? updatedFolder : f)) }));
    },

    removeFolder: async (folderId) => {
      await deleteFolderFromDB(folderId);
      set(state => ({
        folders: state.folders.filter(f => f.id !== folderId),
        feeds: state.feeds.map(f => (f.folderId === folderId ? { ...f, folderId: undefined } : f))
      }));
    },

    toggleFolderCollapsed: async (folderId) => {
      const folder = get().folders.find(f => f.id === folderId);
      if (!folder) return;
      await get().updateFolder(folderId, { collapsed: !folder.collapsed });
    },

    toggleFavorite: async (image) => {
      const { favoriteIds } = get();
      if (favoriteIds.has(image.id)) {
        set(state => {
          const ids = new Set(state.favoriteIds);
          ids.delete(image.id);
          return { favorites: state.favorites.filter(f => f.imageId !== image.id), favoriteIds: ids };
        });
        await removeFavorite(image.id);
      } else {
        const favorite: FavoriteImage = {
          imageId: image.id,
          feedId: image.feedId,
          url: image.url,
          thumbnailUrl: image.thumbnailUrl,
          sourceUrl: image.sourceUrl,
          title: image.title,
          savedAt: Date.now()
        };
        set(state => ({
          favorites: [favorite, ...state.favorites],
          favoriteIds: new Set([...state.favoriteIds, image.id])
        }));
        await addFavorite(favorite);
      }
    },

    isFavorited: (imageId) => get().favoriteIds.has(imageId),

    clearError: () => set({ error: null })
  };
});
