import { describe, it, expect } from 'vitest';
import type { Feed } from '../../src/types';
import { normalizeFeedOrder, moveFeed } from '../../src/lib/feed-order';

const f = (id: string, order?: number): Feed => ({ id, url: `https://${id}.com/feed`, title: id, order } as Feed);

describe('normalizeFeedOrder', () => {
  it('keeps the v1.4.0 visible order (stable on ties, missing orders last) and renumbers', () => {
    // v1.4.0 sorted getAll() (by id) with a stable sort on `order`.
    const { feeds, changed } = normalizeFeedOrder([f('a', 2), f('b', 0), f('c', 2), f('d'), f('e', 5)]);
    expect(feeds.map(x => x.id)).toEqual(['b', 'a', 'c', 'e', 'd']);
    expect(feeds.map(x => x.order)).toEqual([0, 1, 2, 3, 4]);
    expect(changed.map(x => x.id).sort()).toEqual(['a', 'd', 'e']);
  });
  it('is a no-op on an already clean list', () => {
    const { changed } = normalizeFeedOrder([f('a', 0), f('b', 1)]);
    expect(changed).toEqual([]);
  });
});

describe('moveFeed', () => {
  const list = [f('a', 0), f('b', 1), f('c', 2), f('d', 3)];
  it('moves down and up and renumbers', () => {
    expect(moveFeed(list, 'a', 2)!.map(x => `${x.id}${x.order}`)).toEqual(['b0', 'c1', 'a2', 'd3']);
    expect(moveFeed(list, 'd', 0)!.map(x => x.id)).toEqual(['d', 'a', 'b', 'c']);
  });
  it('clamps and ignores no-ops / unknown ids', () => {
    expect(moveFeed(list, 'b', 99)!.map(x => x.id)).toEqual(['a', 'c', 'd', 'b']);
    expect(moveFeed(list, 'a', -1)).toBeNull();
    expect(moveFeed(list, 'zz', 1)).toBeNull();
  });
  it('does not mutate the input', () => {
    moveFeed(list, 'a', 3);
    expect(list.map(x => x.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});
