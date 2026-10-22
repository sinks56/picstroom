/**
 * Image URL helpers.
 *
 * Grid/row cells must never decode full-size images: a 2048px JPEG decodes to ~11 MB of
 * GPU/raster memory, and a few dozen of those exhaust an Android WebView (black tiles,
 * then a frozen or crashed renderer). Cells therefore use a resized copy from the wsrv.nl
 * image proxy (CORS-enabled, cacheable, WebP), falling back to a small srcset candidate
 * and finally the original URL.
 */
import type { FeedImage } from '../types';

export const THUMB_PROXY = 'https://wsrv.nl/';

/** Width buckets keep the number of distinct cached variants small. */
const THUMB_BUCKETS = [240, 360, 480, 640];

export function thumbBucket(cssPx: number, dpr = 1): number {
  // Cap DPR at 2: the visual gain above 2x is negligible but memory grows quadratically.
  const want = Math.ceil(cssPx * Math.min(Math.max(dpr, 1), 2));
  for (const b of THUMB_BUCKETS) if (b >= want) return b;
  return THUMB_BUCKETS[THUMB_BUCKETS.length - 1];
}

function stripProtocol(url: string): string {
  return url.replace(/^https?:\/\//i, '');
}

export function resizedUrl(url: string, width: number, quality = 72): string {
  if (!/^https?:\/\//i.test(url)) return url; // data:, blob:, relative: leave untouched
  const params = new URLSearchParams({
    url: stripProtocol(url),
    w: String(width),
    output: 'webp',
    q: String(quality),
    we: '' // never enlarge
  });
  return `${THUMB_PROXY}?${params.toString().replace('we=', 'we')}`;
}

/**
 * Ordered list of candidate URLs for a cell. The component walks the list on error;
 * when every candidate fails the image is collapsed out of the layout.
 */
export function cellSources(image: Pick<FeedImage, 'url' | 'thumbnailUrl'>, width: number, useProxy: boolean): string[] {
  const out: string[] = [];
  const base = image.thumbnailUrl || image.url;
  if (useProxy) out.push(resizedUrl(base, width));
  if (image.thumbnailUrl) out.push(image.thumbnailUrl);
  out.push(image.url);
  return [...new Set(out)];
}

/** Sources for the full-screen viewer: screen-sized copy first, original as fallback. */
export function viewerSources(image: Pick<FeedImage, 'url'>, screenPx: number, useProxy: boolean): string[] {
  const out: string[] = [];
  if (useProxy) out.push(resizedUrl(image.url, Math.min(2048, Math.max(720, Math.ceil(screenPx / 160) * 160)), 82));
  out.push(image.url);
  return [...new Set(out)];
}

/** Aspect ratio (w/h) clamped to a sane range so one panorama can't wreck a layout. */
export function aspectOf(image: Pick<FeedImage, 'width' | 'height'>, fallback = 1, min = 0.5, max = 2): number {
  const r = image.width && image.height ? image.width / image.height : fallback;
  if (!isFinite(r) || r <= 0) return fallback;
  return Math.min(max, Math.max(min, r));
}

/** URLs that already loaded once this session; remounted cells skip the fade-in. */
export const loadedSources = new Set<string>();

/**
 * CORS mode for resized images (wsrv.nl answers with Access-Control-Allow-Origin: *) so the
 * service worker gets real 200 responses it can store in its bounded thumbnail cache.
 * Originals stay no-cors: many hosts don't send CORS headers.
 */
export function corsFor(src: string): 'anonymous' | undefined {
  return src.startsWith(THUMB_PROXY) ? 'anonymous' : undefined;
}
