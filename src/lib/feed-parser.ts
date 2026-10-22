import type { ParsedFeed, ParsedFeedItem, ParsedImage } from '../types';
export type { ParsedImage };

const SKIP_PATTERNS = [
  /feeds\.feedburner\.com/i,
  /pixel\./i,
  /tracking/i,
  /analytics/i,
  /beacon/i,
  /\.gif$/i,
  /spacer/i,
  /blank\./i,
  /1x1/i,
  /wp-content\/plugins/i,
  /gravatar\.com\/avatar/i,
  /s\.w\.org/i,
  /feeds\.wordpress\.com/i,
  /stats\.wordpress\.com/i,
];

function shouldSkipImage(url: string): boolean {
  return SKIP_PATTERNS.some(pattern => pattern.test(url));
}

// Key that treats WordPress-style size variants (photo-300x200.jpg, photo-1024x683.jpg,
// photo.jpg) as the same picture.
export function canonicalImageKey(url: string): string {
  return url.replace(/[?#].*$/, '').replace(/-\d+x\d+(?=\.[a-z0-9]+$)/i, '').toLowerCase();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&#0*38;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function absolutize(url: string, base?: string): string | null {
  const u = decodeEntities(url.trim());
  if (!u || u.startsWith('data:')) return null;
  if (u.startsWith('//')) return 'https:' + u;
  if (/^https?:\/\//i.test(u)) return u;
  if (!base) return null;
  try {
    return new URL(u, base).toString();
  } catch {
    return null;
  }
}

function attr(tag: string, name: string): string | undefined {
  const m = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(tag);
  return m ? (m[2] ?? m[3]) : undefined;
}

function num(v: string | null | undefined): number | undefined {
  if (!v) return undefined;
  const n = parseInt(v, 10);
  return isFinite(n) && n > 0 ? n : undefined;
}

/** Dimensions encoded in WordPress file names: photo-1024x683.jpg */
function dimsFromName(url: string): { width: number; height: number } | undefined {
  const m = /-(\d{2,5})x(\d{2,5})\.[a-z0-9]+(?:[?#].*)?$/i.exec(url);
  if (!m) return undefined;
  return { width: parseInt(m[1], 10), height: parseInt(m[2], 10) };
}

const MIN_DIMENSION = 100;

function isTooSmall(img: ParsedImage): boolean {
  return (!!img.width && img.width < MIN_DIMENSION) || (!!img.height && img.height < MIN_DIMENSION);
}

/** Parse one <img> tag into a ParsedImage: one entry per picture, never per srcset size. */
export function parseImgTag(tag: string, base?: string): ParsedImage | null {
  const src = attr(tag, 'src') || attr(tag, 'data-src') || attr(tag, 'data-lazy-src');
  const srcset = attr(tag, 'srcset') || attr(tag, 'data-srcset');
  let width = num(attr(tag, 'width'));
  let height = num(attr(tag, 'height'));

  const candidates: { u: string; w: number }[] = [];
  if (srcset) {
    for (const part of decodeEntities(srcset).split(/,\s+(?=\S)/)) {
      const [raw, d] = part.trim().split(/\s+/);
      const u = raw ? absolutize(raw, base) : null;
      if (!u || shouldSkipImage(u)) continue;
      const w = d && /^\d+w$/.test(d) ? parseInt(d, 10) : 0;
      candidates.push({ u, w });
    }
  }
  const srcAbs = src ? absolutize(src, base) : null;

  let url: string | null = null;
  let thumb: string | undefined;
  if (candidates.length) {
    const sized = candidates.filter(c => c.w > 0).sort((a, b) => a.w - b.w);
    if (sized.length) {
      const capped = sized.filter(c => c.w <= 2048);
      url = (capped.length ? capped[capped.length - 1] : sized[0]).u;
      const t = sized.find(c => c.w >= 400) || sized[sized.length - 1];
      if (t.u !== url) thumb = t.u;
    } else {
      url = candidates[0].u;
    }
  }
  if (!url) url = srcAbs;
  if (!url || shouldSkipImage(url)) return null;

  // Width/height attributes are often the *display* size; only their ratio matters.
  if (!width || !height) {
    const d = dimsFromName(url) || (thumb && dimsFromName(thumb)) || (srcAbs && dimsFromName(srcAbs)) ||
      candidates.map(c => dimsFromName(c.u)).find(Boolean);
    if (d) {
      width = d.width;
      height = d.height;
    }
  }
  const img: ParsedImage = { url, thumb, width, height };
  if (isTooSmall(img)) return null;
  return img;
}

export function extractImagesFromHtml(html: string, base?: string): ParsedImage[] {
  const images: ParsedImage[] = [];
  const imgTagRegex = /<img\b[^>]*>/gi;
  let match;
  while ((match = imgTagRegex.exec(html)) !== null) {
    const img = parseImgTag(match[0], base);
    if (img) images.push(img);
  }

  const bgRegex = /background-image:\s*url\(["']?([^"')]+)["']?\)/gi;
  while ((match = bgRegex.exec(html)) !== null) {
    const u = absolutize(match[1], base);
    if (u && !shouldSkipImage(u)) images.push({ url: u, ...dimsFromName(u) });
  }

  return dedupeParsed(images);
}

/** Merge entries for the same picture, keeping the first URL but filling missing metadata. */
export function dedupeParsed(images: ParsedImage[]): ParsedImage[] {
  const byKey = new Map<string, ParsedImage>();
  for (const img of images) {
    const key = canonicalImageKey(img.url);
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, { ...img });
      continue;
    }
    if (!prev.thumb && img.thumb) prev.thumb = img.thumb;
    if ((!prev.width || !prev.height) && img.width && img.height) {
      prev.width = img.width;
      prev.height = img.height;
    }
  }
  return [...byKey.values()];
}

function mediaImage(el: Element, base?: string): ParsedImage | null {
  const raw = el.getAttribute('url') || el.getAttribute('href');
  const u = raw ? absolutize(raw, base) : null;
  if (!u || shouldSkipImage(u)) return null;
  const width = num(el.getAttribute('width'));
  const height = num(el.getAttribute('height'));
  const img: ParsedImage = { url: u, width, height };
  if (!width || !height) Object.assign(img, dimsFromName(u));
  return isTooSmall(img) ? null : img;
}

/**
 * Descendants by local name, so prefixed elements (content:encoded, media:content) match
 * regardless of namespace handling in the engine's selector implementation.
 */
function byLocalName(root: Element, name: string): Element[] {
  const out: Element[] = [];
  for (const el of root.getElementsByTagName('*')) if (el.localName === name) out.push(el);
  return out;
}

function extractImagesFromItem(item: Element, base?: string): ParsedImage[] {
  const images: ParsedImage[] = [];

  // Inline content first: it carries srcset (thumbnails) and the article's real order.
  for (const sel of ['encoded', 'description', 'summary']) {
    const el = byLocalName(item, sel)[0];
    if (el?.textContent) images.push(...extractImagesFromHtml(el.textContent, base));
  }
  for (const c of byLocalName(item, 'content')) {
    // Atom <content type="html"> holds HTML; media:content holds a url attribute.
    if (c.getAttribute('url')) continue;
    const type = c.getAttribute('type') || '';
    if ((type === 'html' || type === 'xhtml' || !type) && c.textContent) {
      images.push(...extractImagesFromHtml(c.textContent, base));
    }
  }

  // media:content / media:group / media:thumbnail
  for (const mc of byLocalName(item, 'content')) {
    if (!mc.getAttribute('url')) continue;
    const type = mc.getAttribute('type') || '';
    const medium = mc.getAttribute('medium') || '';
    if (type.startsWith('image/') || medium === 'image' || (!type && !medium)) {
      const img = mediaImage(mc, base);
      if (img) images.push(img);
    }
  }
  for (const mt of byLocalName(item, 'thumbnail')) {
    const img = mediaImage(mt, base);
    if (img) images.push(img);
  }

  for (const enc of byLocalName(item, 'enclosure')) {
    if ((enc.getAttribute('type') || '').startsWith('image/')) {
      const img = mediaImage(enc, base);
      if (img) images.push(img);
    }
  }

  // itunes:image
  for (const im of byLocalName(item, 'image')) {
    if (im.getAttribute('href')) {
      const img = mediaImage(im, base);
      if (img) images.push(img);
    }
  }

  // Direct image links (Atom enclosures etc.)
  for (const link of byLocalName(item, 'link')) {
    const href = link.getAttribute('href') || '';
    const type = link.getAttribute('type') || '';
    const rel = link.getAttribute('rel') || '';
    if (href && (type.startsWith('image/') || (rel === 'enclosure' && type.startsWith('image/')) || /\.(jpe?g|png|webp|avif)(\?|$)/i.test(href))) {
      const img = mediaImage(link, base);
      if (img) images.push(img);
    }
  }

  return dedupeParsed(images);
}

function getTextContent(element: Element | null): string {
  if (!element) return '';
  return element.textContent?.trim() || '';
}

function getAtomLink(item: Element): string {
  const links = item.querySelectorAll('link');
  for (const link of links) {
    const rel = link.getAttribute('rel') || 'alternate';
    if (rel === 'alternate' || !link.getAttribute('rel')) {
      return link.getAttribute('href') || '';
    }
  }
  return '';
}

export function parseFeed(xmlText: string): ParsedFeed | null {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'text/xml');
    
    const parseError = doc.querySelector('parsererror');
    if (parseError) {
      console.error('XML parse error:', parseError.textContent);
      return null;
    }

    // RSS 2.0
    const channel = doc.querySelector('channel');
    if (channel) {
      const title = getTextContent(channel.querySelector(':scope > title'));
      const description = getTextContent(channel.querySelector(':scope > description'));
      const link = getTextContent(channel.querySelector(':scope > link'));
      
      const items: ParsedFeedItem[] = [];
      const itemElements = doc.querySelectorAll('item');
      
      for (const item of itemElements) {
        const itemTitle = getTextContent(item.querySelector('title'));
        const itemLink = getTextContent(item.querySelector('link'));
        const itemGuid = getTextContent(item.querySelector('guid'));
        const pubDateStr = getTextContent(item.querySelector('pubDate'));
        const images = extractImagesFromItem(item, itemLink || link || undefined);
        
        if (images.length > 0) {
          items.push({
            title: itemTitle,
            link: itemLink,
            guid: itemGuid || undefined,
            images,
            pubDate: pubDateStr ? new Date(pubDateStr) : undefined
          });
        }
      }

      return { title, description, siteUrl: link, items };
    }

    // Atom
    const feed = doc.querySelector('feed');
    if (feed) {
      const title = getTextContent(feed.querySelector(':scope > title'));
      const subtitle = getTextContent(feed.querySelector(':scope > subtitle'));
      const linkEl = feed.querySelector(':scope > link[rel="alternate"], :scope > link:not([rel])');
      const siteUrl = linkEl?.getAttribute('href') || '';

      const items: ParsedFeedItem[] = [];
      const entries = doc.querySelectorAll('entry');

      for (const entry of entries) {
        const entryTitle = getTextContent(entry.querySelector('title'));
        const entryLink = getAtomLink(entry);
        const entryId = getTextContent(entry.querySelector('id'));
        const publishedStr = getTextContent(entry.querySelector('published')) || 
                           getTextContent(entry.querySelector('updated'));
        const images = extractImagesFromItem(entry, entryLink || siteUrl || undefined);

        if (images.length > 0) {
          items.push({
            title: entryTitle,
            link: entryLink,
            guid: entryId || undefined,
            images,
            pubDate: publishedStr ? new Date(publishedStr) : undefined
          });
        }
      }

      return { title, description: subtitle, siteUrl, items };
    }

    // RDF (RSS 1.0)
    const rdf = doc.documentElement?.localName === 'RDF' ? doc.documentElement : null;
    if (rdf) {
      const channelEl = rdf.querySelector('channel');
      const title = getTextContent(channelEl?.querySelector('title') || null);
      const description = getTextContent(channelEl?.querySelector('description') || null);
      const link = getTextContent(channelEl?.querySelector('link') || null);

      const items: ParsedFeedItem[] = [];
      const itemElements = rdf.querySelectorAll('item');

      for (const item of itemElements) {
        const itemTitle = getTextContent(item.querySelector('title'));
        const itemLink = getTextContent(item.querySelector('link'));
        const itemAbout = item.getAttribute('rdf:about');
        const dateStr = getTextContent(byLocalName(item, 'date')[0] || null);
        const images = extractImagesFromItem(item, itemLink || link || undefined);

        if (images.length > 0) {
          items.push({
            title: itemTitle,
            link: itemLink,
            guid: itemAbout || undefined,
            images,
            pubDate: dateStr ? new Date(dateStr) : undefined
          });
        }
      }

      return { title, description, siteUrl: link, items };
    }

    return null;
  } catch (error) {
    console.error('Feed parsing error:', error);
    return null;
  }
}

export async function discoverFeedUrl(html: string, baseUrl: string): Promise<string | null> {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Look for RSS/Atom link tags
    const feedLinks = doc.querySelectorAll(
      'link[type="application/rss+xml"], ' +
      'link[type="application/atom+xml"], ' +
      'link[type="application/xml"], ' +
      'link[rel="alternate"][type*="xml"]'
    );

    for (const link of feedLinks) {
      const href = link.getAttribute('href');
      if (href) {
        try {
          return new URL(href, baseUrl).toString();
        } catch {
          continue;
        }
      }
    }

    // Common feed URL patterns to try
    const commonPaths = [
      '/feed',
      '/rss',
      '/feed.xml',
      '/rss.xml',
      '/atom.xml',
      '/index.xml',
      '/feeds/posts/default',
      '/?feed=rss2',
      '/blog/feed',
      '/blog/rss',
    ];

    // Return first common path to try (caller should validate)
    const base = new URL(baseUrl);
    return new URL(commonPaths[0], base.origin).toString();
  } catch {
    return null;
  }
}

export function isFeedUrl(url: string): boolean {
  const feedPatterns = [
    /\/feed\/?$/i,
    /\/rss\/?$/i,
    /\.xml$/i,
    /\/atom\/?$/i,
    /feed=rss/i,
    /\/feeds?\//i,
    /rss2?\.xml/i,
    /atom\.xml/i,
  ];
  return feedPatterns.some(p => p.test(url));
}
