import { describe, it, expect } from 'vitest';
import type { FeedImage } from '../../src/types';
import { layoutMasonry, columnsFor } from '../../src/components/MasonryGrid';
import { layoutRow, ROW_HEIGHT } from '../../src/components/FeedRow';
import { thumbBucket, resizedUrl, cellSources, viewerSources, aspectOf } from '../../src/lib/thumbs';

const mk = (i: number, w?: number, h?: number): FeedImage => ({ id: `i${i}`, feedId: 'f', url: `https://x.com/${i}.jpg`, sourceUrl: '', fetchedAt: 0, width: w, height: h });

describe('layoutMasonry', () => {
  it('uses integer, gap-free columns that tile the full width', () => {
    const imgs = Array.from({ length: 50 }, (_, i) => mk(i, 1000, 500 + (i % 7) * 150));
    const { cells, height } = layoutMasonry(imgs, 412);
    expect(cells).toHaveLength(50);
    for (const c of cells) {
      expect(Number.isInteger(c.x) && Number.isInteger(c.y) && Number.isInteger(c.w) && Number.isInteger(c.h)).toBe(true);
    }
    const xs = [...new Set(cells.map(c => c.x))].sort((a, b) => a - b);
    expect(xs).toEqual([0, 206]);
    expect(Math.max(...cells.map(c => c.x + c.w))).toBe(412);
    expect(height).toBe(Math.max(...cells.map(c => c.y + c.h)));
  });

  it('is deterministic and does not depend on load state; clamps extreme aspects', () => {
    const imgs = [mk(1, 100, 5000), mk(2), mk(3, 5000, 100)];
    const a = layoutMasonry(imgs, 400);
    expect(layoutMasonry(imgs, 400)).toEqual(a);
    const [tall, , wide] = a.cells;
    expect(tall.h).toBeLessThanOrEqual(tall.w * 2 + 1);
    expect(wide.h).toBeGreaterThanOrEqual(Math.floor(wide.w * 0.5) - 1);
  });

  it('columns by width', () => {
    expect([columnsFor(390), columnsFor(700), columnsFor(1000), columnsFor(1400)]).toEqual([2, 3, 4, 5]);
  });
});

describe('layoutRow', () => {
  it('fixed height, contiguous offsets, clamped widths', () => {
    const { cells, width } = layoutRow([mk(1, 1600, 900), mk(2, 100, 1000), mk(3)]);
    expect(cells.every(c => c.h === undefined || c.h === ROW_HEIGHT)).toBe(true);
    expect(cells[0].x).toBe(0);
    expect(cells[1].x).toBe(cells[0].x + cells[0].w);
    expect(cells[1].w).toBeGreaterThanOrEqual(Math.floor(ROW_HEIGHT * 0.6));
    expect(width).toBe(cells[2].x + cells[2].w);
  });
});

describe('thumbs', () => {
  it('buckets widths with DPR capped at 2', () => {
    expect(thumbBucket(100, 1)).toBe(240);
    expect(thumbBucket(206, 2)).toBe(480);
    expect(thumbBucket(206, 3.5)).toBe(480);
    expect(thumbBucket(2000, 2)).toBe(640);
  });

  it('builds proxy URLs and fallback chains', () => {
    const u = resizedUrl('https://x.com/a b.jpg?x=1', 480);
    expect(u.startsWith('https://wsrv.nl/?url=')).toBe(true);
    expect(u).toContain('w=480');
    expect(u).toContain('output=webp');
    const img = { url: 'https://x.com/a.jpg', thumbnailUrl: 'https://x.com/a-400x300.jpg' };
    const cs = cellSources(img, 480, true);
    expect(cs[cs.length - 1]).toBe(img.url);
    expect(cs).toContain(img.thumbnailUrl);
    expect(cellSources(img, 480, false)[0]).toBe(img.thumbnailUrl);
    expect(viewerSources(img, 412 * 2.6, true)[1]).toBe(img.url);
    expect(viewerSources(img, 412, false)).toEqual([img.url]);
  });

  it('aspectOf clamps and falls back', () => {
    expect(aspectOf({})).toBe(1);
    expect(aspectOf({ width: 1000, height: 100 })).toBe(2);
    expect(aspectOf({ width: 300, height: 200 })).toBeCloseTo(1.5);
  });
});
