import { describe, it, expect } from 'vitest';
import type { Feed, FeedImage, ParsedFeed } from '../../src/types';
import {
  DAY_MS, buildFeedImages, dedupeImages, mergeImages, pruneImages, filterByTimeWindow, windowCutoff,
  nextMultiplierRevealingOlder, capPerPost, buildPagedUrl, backoffDelay, pagingState, applyPageOutcome,
  PAGE_BACKOFF_BASE_MS, PAGE_BACKOFF_MAX_MS, NO_MORE_PAGES_RECHECK_MS, runLimited, sortByDateDesc
} from '../../src/lib/collections';

const NOW = Date.UTC(2026, 9, 21, 12);
let n = 0;
function img(p: Partial<FeedImage> = {}): FeedImage {
  n++;
  return { id: `id${n}`, feedId: 'f1', url: `https://x.com/i${n}.jpg`, sourceUrl: `https://x.com/p${n}`, fetchedAt: NOW, ...p };
}
const feed = (p: Partial<Feed> = {}): Feed => ({ id: 'f1', url: 'https://x.com/feed/', title: 'X', order: 0, createdAt: NOW, ...p } as Feed);

describe('buildFeedImages', () => {
  it('creates one record per picture, keeps in-post order when sorted, and dedupes', () => {
    const parsed: ParsedFeed = {
      title: 'X', items: [
        { title: 'P', link: 'https://x.com/p', guid: 'g', pubDate: new Date(NOW - DAY_MS), images: [
          { url: 'https://x.com/a-300x200.jpg' }, { url: 'https://x.com/b.jpg', thumb: 'https://x.com/b-400x300.jpg' }, { url: 'https://x.com/a.jpg', width: 3, height: 2 }
        ] }
      ]
    };
    const out = buildFeedImages(parsed, feed(), NOW);
    expect(out).toHaveLength(2);
    expect(sortByDateDesc(out).map(i => i.url)).toEqual(['https://x.com/a-300x200.jpg', 'https://x.com/b.jpg']);
    expect(out[0].width).toBe(3); // metadata filled from the duplicate
    expect(out[1].thumbnailUrl).toBe('https://x.com/b-400x300.jpg');
    expect(out.every(i => i.sourceUrl === 'https://x.com/p' && i.guid === 'g')).toBe(true);
  });
});

describe('dedupe / merge / prune', () => {
  it('dedupeImages collapses size variants, not distinct images of one post', () => {
    const a = img({ url: 'https://x.com/a-1024x683.jpg', guid: 'g' });
    const b = img({ url: 'https://x.com/a.jpg', guid: 'g' });
    const c = img({ url: 'https://x.com/c.jpg', guid: 'g' });
    expect(dedupeImages([a, b, c]).map(i => i.id)).toEqual([a.id, c.id]);
  });

  it('mergeImages keeps existing ids and reports only changed records', () => {
    const old = img({ url: 'https://x.com/a.jpg' });
    const same = img({ url: 'https://x.com/a.jpg' });
    const withDims = img({ url: 'https://x.com/a-10x10.jpg', width: 4, height: 3 });
    const fresh = img({ url: 'https://x.com/new.jpg' });
    const r1 = mergeImages([old], [same]);
    expect(r1.added).toBe(0);
    expect(r1.changed).toHaveLength(0);
    const r2 = mergeImages([old], [withDims, fresh]);
    expect(r2.added).toBe(1);
    expect(r2.changed.map(i => i.id).sort()).toEqual([old.id, fresh.id].sort());
    expect(r2.merged.find(i => i.id === old.id)!.width).toBe(4);
  });

  it('pruneImages keeps the newest', () => {
    const imgs = [img({ pubDate: NOW - 3 }), img({ pubDate: NOW - 1 }), img({ pubDate: NOW - 2 })];
    const { kept, pruned } = pruneImages(imgs, 2);
    expect(kept.map(i => i.pubDate)).toEqual([NOW - 1, NOW - 2]);
    expect(pruned.map(i => i.pubDate)).toEqual([NOW - 3]);
  });
});

describe('time window', () => {
  it('filters by 14-day chunks', () => {
    const recent = img({ pubDate: NOW - 3 * DAY_MS });
    const old = img({ pubDate: NOW - 20 * DAY_MS });
    expect(filterByTimeWindow([recent, old], 1, NOW)).toEqual([recent]);
    expect(filterByTimeWindow([recent, old], 2, NOW)).toEqual([recent, old]);
    expect(windowCutoff(0, NOW)).toBe(windowCutoff(1, NOW));
  });

  it('jumps straight to the chunk with the next older image', () => {
    const imgs = [img({ pubDate: NOW - DAY_MS }), img({ pubDate: NOW - 100 * DAY_MS })];
    expect(nextMultiplierRevealingOlder(imgs, 1, NOW)).toBe(8); // ceil(100/14)
    expect(nextMultiplierRevealingOlder(imgs, 8, NOW)).toBeNull();
    // Always advances at least one chunk.
    expect(nextMultiplierRevealingOlder([img({ pubDate: NOW - 15 * DAY_MS })], 1, NOW)).toBe(2);
  });

  it('falls back to fetchedAt without pubDate', () => {
    expect(filterByTimeWindow([img({ fetchedAt: NOW - 30 * DAY_MS })], 1, NOW)).toHaveLength(0);
  });
});

describe('capPerPost', () => {
  it('limits images per post and preserves order', () => {
    const a = [1, 2, 3, 4].map(() => img({ guid: 'post-a' }));
    const b = [1, 2].map(() => img({ guid: 'post-b' }));
    const other = img({ guid: 'post-a', feedId: 'f2' });
    const list = [a[0], b[0], a[1], a[2], other, a[3], b[1]];
    expect(capPerPost(list, 2)).toEqual([a[0], b[0], a[1], other, b[1]]);
    expect(capPerPost(list, 0)).toBe(list);
  });
});

describe('paging', () => {
  it('buildPagedUrl sets or replaces the paged parameter', () => {
    expect(buildPagedUrl('https://x.com/feed/', 3)).toBe('https://x.com/feed/?paged=3');
    expect(buildPagedUrl('https://x.com/feed/?paged=2&a=1', 3)).toBe('https://x.com/feed/?paged=3&a=1');
  });

  it('backoff grows exponentially and is capped', () => {
    expect(backoffDelay(0)).toBe(0);
    expect(backoffDelay(1)).toBe(PAGE_BACKOFF_BASE_MS);
    expect(backoffDelay(2)).toBe(2 * PAGE_BACKOFF_BASE_MS);
    expect(backoffDelay(50)).toBe(PAGE_BACKOFF_MAX_MS);
  });

  it('a failure backs off instead of ending the feed; success resets', () => {
    let f = feed({ lastFetchedPage: 1 });
    expect(pagingState(f, NOW)).toBe('eligible');
    f = { ...f, ...applyPageOutcome(f, { kind: 'failed' }, NOW) };
    expect(f.noMorePages).toBeFalsy();
    expect(pagingState(f, NOW)).toBe('backoff');
    expect(pagingState(f, NOW + PAGE_BACKOFF_BASE_MS + 1)).toBe('eligible');
    f = { ...f, ...applyPageOutcome(f, { kind: 'failed' }, NOW) };
    expect(f.pageFailures).toBe(2);
    expect(f.nextPageRetryAt).toBe(NOW + 2 * PAGE_BACKOFF_BASE_MS);
    f = { ...f, ...applyPageOutcome(f, { kind: 'added', page: 2 }, NOW) };
    expect(f).toMatchObject({ lastFetchedPage: 2, pageFailures: 0, nextPageRetryAt: undefined });
    expect(pagingState(f, NOW)).toBe('eligible');
  });

  it('an empty page exhausts the feed, rechecked after a day', () => {
    const f = { ...feed(), ...applyPageOutcome(feed(), { kind: 'empty' }, NOW) };
    expect(pagingState(f, NOW + 1000)).toBe('exhausted');
    expect(pagingState(f, NOW + NO_MORE_PAGES_RECHECK_MS + 1)).toBe('eligible');
    // Legacy records (noMorePages without timestamp) count as exhausted.
    expect(pagingState(feed({ noMorePages: true }), NOW)).toBe('exhausted');
  });

  it('runLimited respects the concurrency limit and runs everything', async () => {
    let active = 0, peak = 0;
    const done: number[] = [];
    await runLimited([1, 2, 3, 4, 5, 6, 7], 3, async (x) => {
      active++; peak = Math.max(peak, active);
      await new Promise(r => setTimeout(r, 5));
      done.push(x); active--;
    });
    expect(peak).toBe(3);
    expect(done.sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});
