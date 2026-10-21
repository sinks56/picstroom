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
  getImagesByFeed,
  getAllImages,
  saveImages,
  clearFeedImages,
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
import { imageCache } from '../lib/image-cache';

function filterImagesByTimeWindow(images: FeedImage[], timeWindowDays: number): FeedImage[] {
  if (timeWindowDays <= 0) return images;
  const cutoff = Date.now() - (timeWindowDays * 24 * 60 * 60 * 1000);
  return images.filter(img => {
    const date = img.pubDate || img.fetchedAt;
    return date >= cutoff;
  });
}

interface AppState {
  initialized: boolean;
  settings: Settings;
  feeds: Feed[];
  folders: Folder[];
  favorites: FavoriteImage[];
  imagesByFeed: Record<string, FeedImage[]>;
  allImages: FeedImage[];
  loadingFeeds: Set<string>;
  error: string | null;

  // Computed
  filteredImagesByFeed: () => Record<string, FeedImage[]>;
  filteredAllImages: () => FeedImage[];

  // Actions
  initialize: () => Promise<void>;
  updateSettings: (settings: Partial<Settings>) => Promise<void>;
  
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

export const useStore = create<AppState>((set, get) => ({
  initialized: false,
  settings: DEFAULT_SETTINGS,
  feeds: [],
  folders: [],
  favorites: [],
  imagesByFeed: {},
  allImages: [],
  loadingFeeds: new Set(),
  error: null,

  filteredImagesByFeed: () => {
    const { imagesByFeed, settings } = get();
    const result: Record<string, FeedImage[]> = {};
    for (const [feedId, images] of Object.entries(imagesByFeed)) {
      result[feedId] = filterImagesByTimeWindow(images, settings.timeWindowDays);
    }
    return result;
  },

  filteredAllImages: () => {
    const { allImages, settings } = get();
    return filterImagesByTimeWindow(allImages, settings.timeWindowDays);
  },

  initialize: async () => {
    try {
      await Promise.all([initDB(), imageCache.init()]);
      const [settings, feeds, folders, favorites] = await Promise.all([
        getSettings(),
        getFeeds(),
        getFolders(),
        getFavorites()
      ]);

      // Load images for each feed
      const imagesByFeed: Record<string, FeedImage[]> = {};
      for (const feed of feeds) {
        const images = await getImagesByFeed(feed.id);
        imagesByFeed[feed.id] = images;
      }

      const allImages = await getAllImages();

      set({
        initialized: true,
        settings,
        feeds,
        folders,
        favorites,
        imagesByFeed,
        allImages
      });

      // Apply theme
      const { theme } = settings;
      if (theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    } catch (error) {
      console.error('Failed to initialize:', error);
      set({ error: 'Failed to initialize app' });
    }
  },

  updateSettings: async (updates) => {
    const { settings } = get();
    const newSettings = { ...settings, ...updates };
    await saveSettings(newSettings);
    set({ settings: newSettings });

    // Apply theme
    const { theme } = newSettings;
    if (theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  },

  addFeed: async (urlOrFeedUrl, customTitle) => {
    const { feeds, settings } = get();
    let feedUrl = urlOrFeedUrl.trim();

    // Ensure URL has protocol
    if (!feedUrl.startsWith('http://') && !feedUrl.startsWith('https://')) {
      feedUrl = 'https://' + feedUrl;
    }

    try {
      // Check if it's a feed URL or site URL
      if (!isFeedUrl(feedUrl)) {
        // Try to discover feed from site
        const result = await fetchWithCorsProxy(feedUrl, settings.proxyList, settings.customProxyUrl);
        if (result.ok && result.text) {
          const discoveredUrl = await discoverFeedUrl(result.text, feedUrl);
          if (discoveredUrl) {
            feedUrl = discoveredUrl;
          }
        }
      }

      // Fetch the feed
      const result = await fetchWithCorsProxy(feedUrl, settings.proxyList, settings.customProxyUrl);
      if (!result.ok || !result.text) {
        set({ error: `Failed to fetch feed: ${result.error || 'Unknown error'}` });
        return null;
      }

      const parsed = parseFeed(result.text);
      if (!parsed) {
        set({ error: 'Could not parse feed. Make sure the URL points to a valid RSS or Atom feed.' });
        return null;
      }

      // Check if feed already exists
      if (feeds.some(f => f.url === feedUrl)) {
        set({ error: 'This feed has already been added.' });
        return null;
      }

      const feed: Feed = {
        id: uuid(),
        url: feedUrl,
        title: customTitle || parsed.title || 'Untitled Feed',
        siteUrl: parsed.siteUrl,
        description: parsed.description,
        order: feeds.length,
        lastFetched: Date.now()
      };

      await saveFeed(feed);

      // Extract and save images
      const images: FeedImage[] = [];
      for (const item of parsed.items) {
        for (const imgUrl of item.images) {
          images.push({
            id: uuid(),
            feedId: feed.id,
            url: imgUrl,
            sourceUrl: item.link || feedUrl,
            title: item.title,
            pubDate: item.pubDate ? item.pubDate.getTime() : undefined,
            fetchedAt: Date.now()
          });
        }
      }

      if (images.length > 0) {
        await saveImages(images);
      }

      set(state => ({
        feeds: [...state.feeds, feed],
        imagesByFeed: { ...state.imagesByFeed, [feed.id]: images },
        allImages: [...images, ...state.allImages].sort((a, b) => b.fetchedAt - a.fetchedAt)
      }));

      return feed;
    } catch (error) {
      console.error('Error adding feed:', error);
      set({ error: 'Failed to add feed. Please check the URL and try again.' });
      return null;
    }
  },

  updateFeed: async (feedId, updates) => {
    const { feeds } = get();
    const feed = feeds.find(f => f.id === feedId);
    if (!feed) return;

    const updatedFeed = { ...feed, ...updates };
    await saveFeed(updatedFeed);

    set(state => ({
      feeds: state.feeds.map(f => f.id === feedId ? updatedFeed : f)
    }));
  },

  removeFeed: async (feedId) => {
    await deleteFeedFromDB(feedId);

    set(state => ({
      feeds: state.feeds.filter(f => f.id !== feedId),
      imagesByFeed: Object.fromEntries(
        Object.entries(state.imagesByFeed).filter(([id]) => id !== feedId)
      ),
      allImages: state.allImages.filter(img => img.feedId !== feedId)
    }));
  },

  refreshFeed: async (feedId) => {
    const { feeds, settings, loadingFeeds } = get();
    const feed = feeds.find(f => f.id === feedId);
    if (!feed || loadingFeeds.has(feedId)) return;

    set(state => ({
      loadingFeeds: new Set([...state.loadingFeeds, feedId])
    }));

    try {
      const result = await fetchWithCorsProxy(feed.url, settings.proxyList, settings.customProxyUrl);
      if (!result.ok || !result.text) {
        await get().updateFeed(feedId, { errorMessage: result.error || 'Failed to fetch' });
        return;
      }

      const parsed = parseFeed(result.text);
      if (!parsed) {
        await get().updateFeed(feedId, { errorMessage: 'Failed to parse feed' });
        return;
      }

      // Clear old images and add new ones
      await clearFeedImages(feedId);

      const images: FeedImage[] = [];
      for (const item of parsed.items) {
        for (const imgUrl of item.images) {
          images.push({
            id: uuid(),
            feedId: feed.id,
            url: imgUrl,
            sourceUrl: item.link || feed.url,
            title: item.title,
            pubDate: item.pubDate ? item.pubDate.getTime() : undefined,
            fetchedAt: Date.now()
          });
        }
      }

      if (images.length > 0) {
        await saveImages(images);
      }

      await get().updateFeed(feedId, {
        lastFetched: Date.now(),
        errorMessage: undefined
      });

      set(state => ({
        imagesByFeed: { ...state.imagesByFeed, [feedId]: images },
        allImages: [
          ...images,
          ...state.allImages.filter(img => img.feedId !== feedId)
        ].sort((a, b) => b.fetchedAt - a.fetchedAt)
      }));
    } catch (error) {
      console.error('Error refreshing feed:', error);
      await get().updateFeed(feedId, { errorMessage: 'Refresh failed' });
    } finally {
      set(state => {
        const newLoading = new Set(state.loadingFeeds);
        newLoading.delete(feedId);
        return { loadingFeeds: newLoading };
      });
    }
  },

  refreshAllFeeds: async () => {
    const { feeds } = get();
    await Promise.all(feeds.map(f => get().refreshFeed(f.id)));
  },

  reorderFeed: async (feedId, newIndex) => {
    const { feeds } = get();
    const currentIndex = feeds.findIndex(f => f.id === feedId);
    if (currentIndex === -1 || currentIndex === newIndex) return;

    const newFeeds = [...feeds];
    const [removed] = newFeeds.splice(currentIndex, 1);
    newFeeds.splice(newIndex, 0, removed);

    // Update order for all affected feeds
    for (let i = 0; i < newFeeds.length; i++) {
      newFeeds[i] = { ...newFeeds[i], order: i };
      await saveFeed(newFeeds[i]);
    }

    set({ feeds: newFeeds });
  },

  addFolder: async (name) => {
    const { folders } = get();
    const folder: Folder = {
      id: uuid(),
      name,
      order: folders.length,
      collapsed: false
    };

    await saveFolder(folder);
    set(state => ({ folders: [...state.folders, folder] }));
    return folder;
  },

  updateFolder: async (folderId, updates) => {
    const { folders } = get();
    const folder = folders.find(f => f.id === folderId);
    if (!folder) return;

    const updatedFolder = { ...folder, ...updates };
    await saveFolder(updatedFolder);

    set(state => ({
      folders: state.folders.map(f => f.id === folderId ? updatedFolder : f)
    }));
  },

  removeFolder: async (folderId) => {
    await deleteFolderFromDB(folderId);

    set(state => ({
      folders: state.folders.filter(f => f.id !== folderId),
      feeds: state.feeds.map(f => f.folderId === folderId ? { ...f, folderId: undefined } : f)
    }));
  },

  toggleFolderCollapsed: async (folderId) => {
    const { folders } = get();
    const folder = folders.find(f => f.id === folderId);
    if (!folder) return;

    await get().updateFolder(folderId, { collapsed: !folder.collapsed });
  },

  toggleFavorite: async (image) => {
    const { favorites } = get();
    const existing = favorites.find(f => f.imageId === image.id);

    if (existing) {
      await removeFavorite(image.id);
      set(state => ({
        favorites: state.favorites.filter(f => f.imageId !== image.id)
      }));
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
      await addFavorite(favorite);
      set(state => ({
        favorites: [favorite, ...state.favorites]
      }));
    }
  },

  isFavorited: (imageId) => {
    return get().favorites.some(f => f.imageId === imageId);
  },

  clearError: () => set({ error: null })
}));
