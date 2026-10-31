import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseFeed } from '../../src/lib/feed-parser';
import {
  buildFeedImages, effectiveMultiplier, filterByTimeWindow, filterByTimeWindowMin, DAY_MS
} from '../../src/lib/collections';
import { resizedUrl, cellSources, viewerSources, corsFor, isJetpackCdn } from '../../src/lib/thumbs';

// Trimmed copy of https://www.featureshoot.com/feed/ (WordPress + Jetpack). CDATA is
// entity-encoded because happy-dom's XML parser lacks CDATA support; real Chrome parses the
// original (see tests/e2e/featureshoot.spec.ts).
const xml = readFileSync(resolve(process.cwd(), 'tests/unit/fixtures/featureshoot.xml'), 'utf8');
const feedMeta = { id: 'fs', url: 'https://www.featureshoot.com/feed/' };

describe('Feature Shoot (WordPress + Jetpack) feed', () => {
  const feed = parseFeed(xml)!;

  it('parses, one entry per picture with Jetpack thumbnails and dimensions', () => {
    expect(feed.title).toBe('Feature Shoot');
    expect(feed.items).toHaveLength(3);
    const first = feed.items[0];
    expect(first.pubDate!.toISOString()).toBe('2026-09-14T01:06:27.000Z');
    expect(first.images).toHaveLength(3);
    for (const img of first.images) {
      expect(img.url).toMatch(/^https:\/\/i0\.wp\.com\//);
      expect(img.url).not.toContain('&#038;');
      expect(img.width).toBeGreaterThan(500);
      expect(img.height).toBeGreaterThan(500);
    }
  });

  it('resizes Jetpack images on the Jetpack CDN (wsrv.nl refuses i0.wp.com)', () => {
    const src = feed.items[0].images[2].url; // ...jpg?resize=1280%2C1920&ssl=1
    expect(isJetpackCdn(src)).toBe(true);
    const r = resizedUrl(src, 360);
    expect(r.startsWith('https://i0.wp.com/')).toBe(true);
    const q = new URL(r).searchParams;
    expect(q.get('w')).toBe('360');
    expect(q.get('ssl')).toBe('1');
    expect(q.has('resize')).toBe(false);
    expect(cellSources({ url: src }, 360, true)[0]).toBe(r);
    expect(viewerSources({ url: src }, 1080, true)[0].startsWith('https://i0.wp.com/')).toBe(true);
    expect(corsFor(r)).toBe('anonymous');
    // Everything else still goes through wsrv.nl.
    expect(resizedUrl('https://x.com/a.jpg', 360).startsWith('https://wsrv.nl/')).toBe(true);
  });

  it('a quiet feed (newest post 6 weeks old) is not empty in the 14-day window', () => {
    const now = Date.parse('2026-10-31T10:00:00Z');
    const images = buildFeedImages(feed, feedMeta, now);
    expect(images.length).toBeGreaterThanOrEqual(6);
    // The old behaviour: nothing visible.
    expect(filterByTimeWindow(images, 1, now)).toHaveLength(0);
    // Now: the newest pictures are shown anyway.
    const shown = filterByTimeWindowMin(images, 1, 24, now);
    expect(shown.length).toBeGreaterThan(0);
  });
});

describe('effectiveMultiplier', () => {
  const now = Date.parse('2026-10-31T10:00:00Z');
  const at = (daysAgo: number) => ({ pubDate: now - daysAgo * DAY_MS, fetchedAt: now });

  it('leaves busy feeds alone', () => {
    const imgs = Array.from({ length: 30 }, (_, i) => at(i % 10));
    expect(effectiveMultiplier(imgs, 1, 24, now)).toBe(1);
  });
  it('widens (skipping empty fortnights) until enough pictures are visible', () => {
    const imgs = [...Array.from({ length: 10 }, () => at(47)), ...Array.from({ length: 20 }, () => at(200))];
    const m = effectiveMultiplier(imgs, 1, 24, now);
    expect(m).toBeGreaterThan(3);
    expect(filterByTimeWindow(imgs, m, now).length).toBeGreaterThanOrEqual(24);
  });
  it('stops when nothing older exists, and handles empty input', () => {
    expect(filterByTimeWindowMin([at(100)], 1, 24, now)).toHaveLength(1);
    expect(effectiveMultiplier([], 3, 24, now)).toBe(3);
  });
});
