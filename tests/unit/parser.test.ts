import { describe, it, expect } from 'vitest';
import { parseFeed, parseImgTag, extractImagesFromHtml, canonicalImageKey } from '../../src/lib/feed-parser';

const WP = 'https://example.com/wp-content/uploads/2026/10';

describe('canonicalImageKey', () => {
  it('treats WordPress size variants and query strings as one picture', () => {
    const a = canonicalImageKey(`${WP}/house-1024x683.jpg?resize=1`);
    expect(a).toBe(canonicalImageKey(`${WP}/house.jpg`));
    expect(a).toBe(canonicalImageKey(`${WP}/HOUSE-300x200.JPG`));
    expect(a).not.toBe(canonicalImageKey(`${WP}/house-2.jpg`));
  });
});

describe('parseImgTag', () => {
  it('picks the largest srcset candidate <= 2048w as url and a >= 400w one as thumb', () => {
    const tag = `<img src="${WP}/a-300x200.jpg" srcset="${WP}/a-300x200.jpg 300w, ${WP}/a-768x512.jpg 768w, ${WP}/a-1536x1024.jpg 1536w, ${WP}/a-3000x2000.jpg 3000w">`;
    const img = parseImgTag(tag)!;
    expect(img.url).toBe(`${WP}/a-1536x1024.jpg`);
    expect(img.thumb).toBe(`${WP}/a-768x512.jpg`);
    expect(img.width! / img.height!).toBeCloseTo(1.5);
  });

  it('decodes entities, absolutizes protocol-relative and relative URLs, reads lazy attributes', () => {
    expect(parseImgTag('<img data-src="//cdn.x.com/p.jpg?a=1&amp;b=2">')!.url).toBe('https://cdn.x.com/p.jpg?a=1&b=2');
    expect(parseImgTag('<img src="/img/p.jpg">', 'https://site.org/post/1')!.url).toBe('https://site.org/img/p.jpg');
    expect(parseImgTag('<img src="/img/p.jpg">')).toBeNull();
  });

  it('skips tiny, tracking and data: images', () => {
    expect(parseImgTag('<img src="https://x.com/a.jpg" width="1" height="1">')).toBeNull();
    expect(parseImgTag('<img src="https://x.com/pixel.png">')).toBeNull();
    expect(parseImgTag('<img src="data:image/png;base64,AAAA">')).toBeNull();
    expect(parseImgTag('<img src="https://x.com/anim.gif">')).toBeNull();
  });
});

describe('extractImagesFromHtml', () => {
  it('returns one entry per picture even when variants repeat', () => {
    const html = `<p><img src="${WP}/a-300x200.jpg" srcset="${WP}/a-300x200.jpg 300w, ${WP}/a-1024x683.jpg 1024w"></p>
      <figure><img src="${WP}/a.jpg"></figure><img src="${WP}/b-800x600.jpg">`;
    const imgs = extractImagesFromHtml(html);
    expect(imgs.map(i => canonicalImageKey(i.url))).toEqual([canonicalImageKey(`${WP}/a.jpg`), canonicalImageKey(`${WP}/b.jpg`)]);
  });
});

describe('parseFeed', () => {
  // (happy-dom's XML parser lacks CDATA support, so content is entity-encoded here; real CDATA
  // feeds are covered by the e2e test against live feeds in Chrome.)
  it('parses RSS 2.0 with content:encoded and media:content, deduping across sources', () => {
    const xml = `<?xml version="1.0"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:media="http://search.yahoo.com/mrss/">
<channel><title>Mag</title><link>https://mag.example</link><description>d</description>
<item><title>Post 1</title><link>https://mag.example/p1</link><guid>p1</guid><pubDate>Tue, 20 Oct 2026 10:00:00 GMT</pubDate>
<content:encoded>&lt;img src="${WP}/one-1024x768.jpg"&gt;&lt;img src="${WP}/two-800x1200.jpg"&gt;</content:encoded>
<media:content url="${WP}/one.jpg" medium="image" width="2000" height="1500"/>
</item>
<item><title>No images</title><link>https://mag.example/p2</link><description>text only</description></item>
</channel></rss>`;
    const feed = parseFeed(xml)!;
    expect(feed.title).toBe('Mag');
    expect(feed.items).toHaveLength(1);
    const it0 = feed.items[0];
    expect(it0.guid).toBe('p1');
    expect(it0.pubDate!.toISOString()).toBe('2026-10-20T10:00:00.000Z');
    expect(it0.images).toHaveLength(2);
    expect(it0.images[0].url).toBe(`${WP}/one-1024x768.jpg`);
    expect(it0.images[1].height).toBe(1200);
  });

  it('parses Atom feeds with html content', () => {
    const xml = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>A</title>
<link rel="alternate" href="https://a.example"/>
<entry><title>E</title><link rel="alternate" href="https://a.example/e"/><id>e1</id><updated>2026-10-19T00:00:00Z</updated>
<content type="html">&lt;img src="https://a.example/pic-640x480.jpg"&gt;</content></entry></feed>`;
    const feed = parseFeed(xml)!;
    expect(feed.title).toBe('A');
    expect(feed.items).toHaveLength(1);
    expect(feed.items[0].images[0].url).toBe('https://a.example/pic-640x480.jpg');
  });

  it('returns null for invalid XML', () => {
    expect(parseFeed('<rss><channel><title>x</channel>')).toBeNull();
  });
});
