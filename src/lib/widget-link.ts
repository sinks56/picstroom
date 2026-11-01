import type { FeedImage } from '../types';

/**
 * Tapping a picture on a home-screen widget opens the app with
 * picstroom://image?id=…&u=<image url>&s=<post url>&t=<title>&f=<feed id>
 */
export interface WidgetLink {
  id: string;
  url: string;
  sourceUrl: string;
  title?: string;
  feedId: string;
}

export function parseWidgetLink(raw: string): WidgetLink | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'picstroom:' || u.hostname !== 'image') return null;
  const id = u.searchParams.get('id') || '';
  const url = u.searchParams.get('u') || '';
  if (!id && !url) return null;
  if (url && !/^https?:\/\//i.test(url)) return null;
  return {
    id,
    url,
    sourceUrl: u.searchParams.get('s') || url,
    title: u.searchParams.get('t') || undefined,
    feedId: u.searchParams.get('f') || ''
  };
}

/** Resolve a link to a picture the viewer can show: a stored one if we have it, else built from the link. */
export function resolveWidgetImage(link: WidgetLink, known: Iterable<FeedImage>): FeedImage | null {
  for (const img of known) {
    if (link.id && img.id === link.id) return img;
  }
  if (!link.url) return null;
  return {
    id: link.id || link.url,
    feedId: link.feedId,
    url: link.url,
    sourceUrl: link.sourceUrl,
    title: link.title,
    fetchedAt: Date.now()
  };
}
