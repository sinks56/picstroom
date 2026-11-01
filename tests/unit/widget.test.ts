import { describe, it, expect } from 'vitest';
import { buildWidgetSnapshot, SNAPSHOT_PER_FEED } from '../../src/lib/widget-sync';
import { parseWidgetLink, resolveWidgetImage } from '../../src/lib/widget-link';
import type { Feed, FeedImage, FavoriteImage } from '../../src/types';

const feed = (id: string, order: number): Feed => ({ id, url: `https://${id}.test/rss`, title: `Feed ${id}`, order });
const img = (id: string, feedId: string, t: number): FeedImage => ({
  id, feedId, url: `https://img.test/${id}.jpg`, sourceUrl: `https://${feedId}.test/p/${id}`, fetchedAt: t, pubDate: t
});

describe('widget snapshot', () => {
  it('keeps the newest pictures per feed and names favourites by feed', () => {
    const feeds = [feed('a', 0), feed('b', 1)];
    const many = Array.from({ length: SNAPSHOT_PER_FEED + 10 }, (_, i) => img(`a${i}`, 'a', 1000 - i));
    const favs: FavoriteImage[] = [
      { imageId: 'a1', feedId: 'a', url: 'https://img.test/a1.jpg', sourceUrl: 'https://a.test/p/1', savedAt: 5 },
      { imageId: 'x', feedId: 'gone', url: 'https://img.test/x.jpg', sourceUrl: 'https://x.test', savedAt: 4 },
      { imageId: 'nourl', feedId: 'a', url: '', sourceUrl: '', savedAt: 3 }
    ];
    const snap = buildWidgetSnapshot(feeds, { a: many, b: [img('b0', 'b', 5)] }, favs, 42);
    expect(snap.at).toBe(42);
    expect(snap.feeds.map(f => f.id)).toEqual(['a', 'b']);
    expect(snap.imgs.filter(i => i.feedId === 'a')).toHaveLength(SNAPSHOT_PER_FEED);
    expect(snap.imgs.find(i => i.id === 'b0')).toBeTruthy();
    expect(snap.favs.map(f => f.id)).toEqual(['a1', 'x']);
    expect(snap.favs[0].feed).toBe('Feed a');
    expect(snap.favs[1].feed).toBe('');
  });

  it('is empty-safe', () => {
    const snap = buildWidgetSnapshot([], {}, []);
    expect(snap.favs).toEqual([]);
    expect(snap.imgs).toEqual([]);
  });
});

describe('widget link', () => {
  const link = 'picstroom://image?id=abc&u=' + encodeURIComponent('https://img.test/a.jpg?x=1&y=2') +
    '&s=' + encodeURIComponent('https://site.test/post') + '&t=Hello%20world&f=feed1';

  it('parses a widget tap link', () => {
    expect(parseWidgetLink(link)).toEqual({
      id: 'abc', url: 'https://img.test/a.jpg?x=1&y=2', sourceUrl: 'https://site.test/post', title: 'Hello world', feedId: 'feed1'
    });
  });
  it('rejects other links', () => {
    expect(parseWidgetLink('https://example.com')).toBeNull();
    expect(parseWidgetLink('picstroom://other?id=1')).toBeNull();
    expect(parseWidgetLink('picstroom://image')).toBeNull();
    expect(parseWidgetLink('picstroom://image?u=javascript:alert(1)')).toBeNull();
    expect(parseWidgetLink('not a url')).toBeNull();
  });
  it('prefers a stored picture, else builds one from the link', () => {
    const l = parseWidgetLink(link)!;
    const stored = img('abc', 'feed1', 1);
    expect(resolveWidgetImage(l, [img('zzz', 'f', 1), stored])).toBe(stored);
    const built = resolveWidgetImage(l, [])!;
    expect(built.url).toBe('https://img.test/a.jpg?x=1&y=2');
    expect(built.sourceUrl).toBe('https://site.test/post');
  });
});
