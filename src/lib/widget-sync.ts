import { Capacitor, registerPlugin } from '@capacitor/core';
import type { Feed, FeedImage, FavoriteImage } from '../types';
import { useStore } from '../store';
import { logDiag } from './diagnostics';

/**
 * Bridge to the native home-screen widgets (Android only). Widgets run without the app
 * open, so the app keeps a compact snapshot of its feeds, newest pictures and favourites
 * in native storage. The snapshot is rewritten (debounced) whenever any of them change,
 * which is how adding/removing a favourite shows up on the Favourites widget.
 */
interface WidgetBridgePlugin {
  sync(options: { json: string }): Promise<void>;
}

/** Newest pictures kept per feed in the snapshot. */
export const SNAPSHOT_PER_FEED = 40;
export const SNAPSHOT_MAX_IMAGES = 1500;
export const SNAPSHOT_MAX_FAVORITES = 1000;

export interface WidgetSnapshot {
  v: 1;
  at: number;
  feeds: { id: string; title: string; url: string; order: number }[];
  favs: { id: string; feedId: string; feed: string; url: string; src: string; title?: string; t: number }[];
  imgs: { id: string; feedId: string; url: string; src: string; title?: string; t: number }[];
}

export function buildWidgetSnapshot(
  feeds: Feed[],
  imagesByFeed: Record<string, FeedImage[]>,
  favorites: FavoriteImage[],
  now = Date.now()
): WidgetSnapshot {
  const feedTitle = new Map(feeds.map(f => [f.id, f.title]));
  const imgs: WidgetSnapshot['imgs'] = [];
  for (const feed of feeds) {
    for (const img of (imagesByFeed[feed.id] || []).slice(0, SNAPSHOT_PER_FEED)) {
      if (!img.url) continue;
      imgs.push({ id: img.id, feedId: feed.id, url: img.url, src: img.sourceUrl, title: img.title, t: img.pubDate || img.fetchedAt });
    }
  }
  if (imgs.length > SNAPSHOT_MAX_IMAGES) {
    imgs.sort((a, b) => b.t - a.t);
    imgs.length = SNAPSHOT_MAX_IMAGES;
  }
  const favs = favorites
    .filter(f => !!f.url)
    .slice(0, SNAPSHOT_MAX_FAVORITES)
    .map(f => ({
      id: f.imageId,
      feedId: f.feedId,
      feed: feedTitle.get(f.feedId) || '',
      url: f.url,
      src: f.sourceUrl,
      title: f.title,
      t: f.savedAt
    }));
  return {
    v: 1,
    at: now,
    feeds: feeds.map(f => ({ id: f.id, title: f.title, url: f.url, order: f.order })),
    favs,
    imgs
  };
}

/** Subscribes to the store and keeps the native snapshot current. Returns a cleanup fn. */
export function startWidgetSync(debounceMs = 4000): () => void {
  if (!Capacitor.isNativePlatform()) return () => {};
  const plugin = registerPlugin<WidgetBridgePlugin>('WidgetBridge');
  let timer: number | undefined;
  let lastJson = '';

  const push = () => {
    timer = undefined;
    const { feeds, imagesByFeed, favorites, initialized } = useStore.getState();
    if (!initialized) return;
    const snap = buildWidgetSnapshot(feeds, imagesByFeed, favorites);
    // Skip identical content (ignore the timestamp) to avoid needless widget redraws.
    const key = JSON.stringify({ ...snap, at: 0 });
    if (key === lastJson) return;
    lastJson = key;
    plugin.sync({ json: JSON.stringify(snap) }).catch(e => {
      lastJson = '';
      logDiag('warn', 'Widget sync failed', e);
    });
  };
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = window.setTimeout(push, debounceMs);
  };

  const unsubscribe = useStore.subscribe((state, prev) => {
    if (
      state.feeds !== prev.feeds ||
      state.favorites !== prev.favorites ||
      state.imagesByFeed !== prev.imagesByFeed ||
      state.initialized !== prev.initialized
    ) schedule();
  });
  schedule();
  return () => {
    unsubscribe();
    if (timer) clearTimeout(timer);
  };
}
