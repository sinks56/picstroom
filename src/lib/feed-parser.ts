import type { ParsedFeed, ParsedFeedItem } from '../types';

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

function extractImagesFromHtml(html: string): string[] {
  const images: string[] = [];
  
  // Match img tags
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = imgRegex.exec(html)) !== null) {
    const src = match[1];
    if (src && !shouldSkipImage(src)) {
      images.push(src);
    }
  }

  // Match srcset for higher quality images
  const srcsetRegex = /<img[^>]+srcset=["']([^"']+)["'][^>]*>/gi;
  while ((match = srcsetRegex.exec(html)) !== null) {
    const srcset = match[1];
    const sources = srcset.split(',').map(s => s.trim().split(/\s+/)[0]);
    for (const src of sources) {
      if (src && !shouldSkipImage(src)) {
        images.push(src);
      }
    }
  }

  // Match background-image in style attributes
  const bgRegex = /background-image:\s*url\(["']?([^"')]+)["']?\)/gi;
  while ((match = bgRegex.exec(html)) !== null) {
    const src = match[1];
    if (src && !shouldSkipImage(src)) {
      images.push(src);
    }
  }

  return [...new Set(images)];
}

function extractImagesFromItem(item: Element, _namespaces: Record<string, string>): string[] {
  const images: string[] = [];

  // media:content
  const mediaContents = item.querySelectorAll('content');
  for (const mc of mediaContents) {
    const url = mc.getAttribute('url');
    const type = mc.getAttribute('type') || '';
    const medium = mc.getAttribute('medium') || '';
    if (url && (type.startsWith('image/') || medium === 'image' || !type)) {
      if (!shouldSkipImage(url)) images.push(url);
    }
  }

  // media:thumbnail
  const mediaThumbnails = item.querySelectorAll('thumbnail');
  for (const mt of mediaThumbnails) {
    const url = mt.getAttribute('url');
    if (url && !shouldSkipImage(url)) images.push(url);
  }

  // media:group > media:content
  const mediaGroups = item.querySelectorAll('group');
  for (const mg of mediaGroups) {
    const contents = mg.querySelectorAll('content');
    for (const mc of contents) {
      const url = mc.getAttribute('url');
      const type = mc.getAttribute('type') || '';
      if (url && (type.startsWith('image/') || !type)) {
        if (!shouldSkipImage(url)) images.push(url);
      }
    }
  }

  // enclosure
  const enclosures = item.querySelectorAll('enclosure');
  for (const enc of enclosures) {
    const url = enc.getAttribute('url');
    const type = enc.getAttribute('type') || '';
    if (url && type.startsWith('image/')) {
      if (!shouldSkipImage(url)) images.push(url);
    }
  }

  // itunes:image
  const itunesImages = item.querySelectorAll('image');
  for (const img of itunesImages) {
    const href = img.getAttribute('href');
    if (href && !shouldSkipImage(href)) images.push(href);
  }

  // description HTML
  const description = item.querySelector('description');
  if (description?.textContent) {
    const htmlImages = extractImagesFromHtml(description.textContent);
    images.push(...htmlImages);
  }

  // content:encoded HTML
  const contentEncoded = item.querySelector('encoded');
  if (contentEncoded?.textContent) {
    const htmlImages = extractImagesFromHtml(contentEncoded.textContent);
    images.push(...htmlImages);
  }

  // Atom content
  const atomContent = item.querySelector('content');
  if (atomContent?.textContent) {
    const type = atomContent.getAttribute('type') || '';
    if (type === 'html' || type === 'xhtml' || !type) {
      const htmlImages = extractImagesFromHtml(atomContent.textContent);
      images.push(...htmlImages);
    }
  }

  // summary (Atom)
  const summary = item.querySelector('summary');
  if (summary?.textContent) {
    const type = summary.getAttribute('type') || '';
    if (type === 'html' || type === 'xhtml' || !type) {
      const htmlImages = extractImagesFromHtml(summary.textContent);
      images.push(...htmlImages);
    }
  }

  // Direct image links
  const links = item.querySelectorAll('link');
  for (const link of links) {
    const href = link.getAttribute('href') || link.textContent || '';
    const type = link.getAttribute('type') || '';
    const rel = link.getAttribute('rel') || '';
    if (href && (type.startsWith('image/') || rel === 'enclosure' || /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(href))) {
      if (!shouldSkipImage(href)) images.push(href);
    }
  }

  return [...new Set(images)];
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

    const namespaces: Record<string, string> = {};
    const root = doc.documentElement;
    for (const attr of root.attributes) {
      if (attr.name.startsWith('xmlns:')) {
        namespaces[attr.name.substring(6)] = attr.value;
      }
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
        const pubDateStr = getTextContent(item.querySelector('pubDate'));
        const images = extractImagesFromItem(item, namespaces);
        
        if (images.length > 0) {
          items.push({
            title: itemTitle,
            link: itemLink,
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
        const publishedStr = getTextContent(entry.querySelector('published')) || 
                           getTextContent(entry.querySelector('updated'));
        const images = extractImagesFromItem(entry, namespaces);

        if (images.length > 0) {
          items.push({
            title: entryTitle,
            link: entryLink,
            images,
            pubDate: publishedStr ? new Date(publishedStr) : undefined
          });
        }
      }

      return { title, description: subtitle, siteUrl, items };
    }

    // RDF (RSS 1.0)
    const rdf = doc.querySelector('RDF');
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
        const dateStr = getTextContent(item.querySelector('date'));
        const images = extractImagesFromItem(item, namespaces);

        if (images.length > 0) {
          items.push({
            title: itemTitle,
            link: itemLink,
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
