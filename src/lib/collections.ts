/**
 * Pure data helpers (no DOM, no IndexedDB) so they can be unit tested.
 */
import { v4 as uuid } from 'uuid';
import type { Feed, FeedImage, ParsedFeed } from '../types';
import { canonicalImageKey } from './feed-parser';

export const DAY_MS = 24 * 60 * 60 * 1000;
export const TIME_WINDOW_CHUNK_DAYS = 14;
/** Hard cap of stored images per feed; oldest are pruned beyond this. */
export const MAX_IMAGES_PER_FEED = 3000;

export function imageDate(img: Pick<FeedImage, 'pubDate' | 'fetchedAt'>): number {
  return img.pubDate || img.fetchedAt;
}

export function getDedupeKey(image: Pick<FeedImage, 'url'>): string {
  return `img:${canonicalImageKey(image.url)}`;
}

export function sortByDateDesc<T extends Pick<FeedImage, 'pubDate' | 'fetchedAt'>>(images: T[]): T[] {
  return [...images].sort((a, b) => imageDate(b) - imageDate(a));
}

/** Convert a parsed feed into FeedImage records (one per picture). */
export function buildFeedImages(parsed: ParsedFeed, feed: Pick<Feed, 'id' | 'url'>, now = Date.now()): FeedImage[] {
  const out: FeedImage[] = [];
  for (const item of parsed.items) {
    const pubDate = item.pubDate && !isNaN(item.pubDate.getTime()) ? item.pubDate.getTime() : undefined;
    item.images.forEach((img, i) => {
      out.push({
        id: uuid(),
        feedId: feed.id,
        url: img.url,
        thumbnailUrl: img.thumb,
        width: img.width,
        height: img.height,
        sourceUrl: item.link || feed.url,
        title: item.title,
        guid: item.guid,
        // Keep in-post order stable when sorting by date (first image = newest).
        pubDate: pubDate !== undefined ? pubDate - i : undefined,
        fetchedAt: now - i
      });
    });
  }
  return dedupeImages(out);
}

export function dedupeImages(images: FeedImage[]): FeedImage[] {
  const seen = new Map<string, FeedImage>();
  for (const img of images) {
    const key = getDedupeKey(img);
    const existing = seen.get(key);
    if (!existing) seen.set(key, img);
    else seen.set(key, fillMetadata(existing, img));
  }
  return [...seen.values()];
}

/** Keep `base` (its id and URL) but fill metadata it lacks from `extra`. */
function fillMetadata(base: FeedImage, extra: FeedImage): FeedImage {
  let changed = false;
  const next = { ...base };
  if (!next.thumbnailUrl && extra.thumbnailUrl) { next.thumbnailUrl = extra.thumbnailUrl; changed = true; }
  if ((!next.width || !next.height) && extra.width && extra.height) {
    next.width = extra.width; next.height = extra.height; changed = true;
  }
  if (!next.guid && extra.guid) { next.guid = extra.guid; changed = true; }
  if (!next.pubDate && extra.pubDate) { next.pubDate = extra.pubDate; changed = true; }
  return changed ? next : base;
}

export interface MergeResult {
  merged: FeedImage[];
  /** Records that are new or whose metadata changed: the only ones that need writing. */
  changed: FeedImage[];
  added: number;
}

/** Merge incoming images into existing ones. Existing ids are preserved. */
export function mergeImages(existing: FeedImage[], incoming: FeedImage[]): MergeResult {
  const byKey = new Map<string, FeedImage>();
  for (const img of existing) byKey.set(getDedupeKey(img), img);
  const changed: FeedImage[] = [];
  let added = 0;
  for (const img of incoming) {
    const key = getDedupeKey(img);
    const old = byKey.get(key);
    if (!old) {
      byKey.set(key, img);
      changed.push(img);
      added++;
    } else {
      const filled = fillMetadata(old, img);
      if (filled !== old) {
        byKey.set(key, filled);
        changed.push(filled);
      }
    }
  }
  return { merged: [...byKey.values()], changed, added };
}

/** Newest-first list capped at `max`; returns the kept list and the pruned records. */
export function pruneImages(images: FeedImage[], max = MAX_IMAGES_PER_FEED): { kept: FeedImage[]; pruned: FeedImage[] } {
  const sorted = sortByDateDesc(images);
  return { kept: sorted.slice(0, max), pruned: sorted.slice(max) };
}

export function windowCutoff(multiplier: number, now = Date.now()): number {
  return now - TIME_WINDOW_CHUNK_DAYS * Math.max(1, multiplier) * DAY_MS;
}

export function filterByTimeWindow<T extends Pick<FeedImage, 'pubDate' | 'fetchedAt'>>(images: T[], multiplier: number, now = Date.now()): T[] {
  const cutoff = windowCutoff(multiplier, now);
  return images.filter(img => imageDate(img) >= cutoff);
}

/**
 * Smallest window multiplier (in 14-day chunks) that reveals at least one stored image
 * older than the current window, or null if there is none. Jumping straight to the next
 * populated chunk means a quiet fortnight in the feeds doesn't end the scroll.
 */
export function nextMultiplierRevealingOlder(images: Pick<FeedImage, 'pubDate' | 'fetchedAt'>[], multiplier: number, now = Date.now()): number | null {
  const cutoff = windowCutoff(multiplier, now);
  let newestOlder = -Infinity;
  for (const img of images) {
    const d = imageDate(img);
    if (d < cutoff && d > newestOlder) newestOlder = d;
  }
  if (newestOlder === -Infinity) return null;
  const chunks = Math.ceil((now - newestOlder) / (TIME_WINDOW_CHUNK_DAYS * DAY_MS));
  return Math.max(multiplier + 1, chunks);
}

/**
 * Limit how many images one post contributes to the combined grid so a single article
 * with 50 pictures can't fill several screens. Order is preserved.
 */
export function capPerPost<T extends Pick<FeedImage, 'sourceUrl' | 'guid' | 'feedId'>>(images: T[], max: number): T[] {
  if (!max || max <= 0) return images;
  const counts = new Map<string, number>();
  const out: T[] = [];
  for (const img of images) {
    const key = `${img.feedId}|${img.guid || img.sourceUrl}`;
    const n = counts.get(key) || 0;
    if (n < max) {
      out.push(img);
      counts.set(key, n + 1);
    }
  }
  return out;
}

export function buildPagedUrl(feedUrl: string, page: number): string {
  try {
    const url = new URL(feedUrl);
    url.searchParams.set('paged', String(page));
    return url.toString();
  } catch {
    const sep = feedUrl.includes('?') ? '&' : '?';
    return `${feedUrl}${sep}paged=${page}`;
  }
}

// ---- Paging with backoff -------------------------------------------------------------

export const PAGE_BACKOFF_BASE_MS = 30_000;
export const PAGE_BACKOFF_MAX_MS = 30 * 60_000;
/** After this long, a feed marked "no more pages" is probed again (archives grow). */
export const NO_MORE_PAGES_RECHECK_MS = 24 * 60 * 60_000;

export function backoffDelay(failures: number): number {
  if (failures <= 0) return 0;
  return Math.min(PAGE_BACKOFF_MAX_MS, PAGE_BACKOFF_BASE_MS * 2 ** (failures - 1));
}

export type PagingState = 'eligible' | 'backoff' | 'exhausted';

export function pagingState(feed: Pick<Feed, 'noMorePages' | 'noMorePagesAt' | 'nextPageRetryAt'>, now = Date.now()): PagingState {
  if (feed.noMorePages && (!feed.noMorePagesAt || now - feed.noMorePagesAt < NO_MORE_PAGES_RECHECK_MS)) return 'exhausted';
  if (feed.nextPageRetryAt && feed.nextPageRetryAt > now) return 'backoff';
  return 'eligible';
}

export type PageOutcome =
  | { kind: 'failed' }            // network/proxy/parse failure: retry later
  | { kind: 'empty' }             // fetched and parsed, but nothing new: end of archive
  | { kind: 'added'; page: number };

/** Feed fields to persist after a page attempt. */
export function applyPageOutcome(feed: Feed, outcome: PageOutcome, now = Date.now()): Partial<Feed> {
  switch (outcome.kind) {
    case 'failed': {
      const failures = (feed.pageFailures || 0) + 1;
      return { pageFailures: failures, nextPageRetryAt: now + backoffDelay(failures) };
    }
    case 'empty':
      return { noMorePages: true, noMorePagesAt: now, pageFailures: 0, nextPageRetryAt: undefined };
    case 'added':
      return { lastFetchedPage: outcome.page, noMorePages: false, noMorePagesAt: undefined, pageFailures: 0, nextPageRetryAt: undefined };
  }
}

/** Run async tasks with bounded concurrency, yielding between tasks to keep input responsive. */
export async function runLimited<T>(items: T[], limit: number, fn: (item: T, index: number) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i], i);
      await new Promise(r => setTimeout(r, 0));
    }
  });
  await Promise.all(workers);
}
