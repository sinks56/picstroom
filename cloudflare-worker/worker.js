/**
 * PicStroom CORS Proxy Worker
 * 
 * A Cloudflare Worker that proxies RSS feed requests to bypass CORS restrictions.
 * Hardened to only allow requests from authorized origins.
 * 
 * Deploy: wrangler deploy
 */

const ALLOWED_ORIGINS = [
  'https://sinks56.github.io'
];

const ALLOWED_LOCALHOST_PATTERN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

const ALLOWED_FEED_CONTENT_TYPES = [
  'application/rss+xml',
  'application/atom+xml',
  'application/xml',
  'text/xml',
  'application/xhtml+xml',
  'text/html'
];

const ALLOWED_IMAGE_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/svg+xml'
];

const MAX_FEED_SIZE = 10 * 1024 * 1024; // 10MB for feeds
const MAX_IMAGE_SIZE = 20 * 1024 * 1024; // 20MB for images
const CACHE_TTL = 600; // 10 minutes

const BROWSER_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (ALLOWED_LOCALHOST_PATTERN.test(origin)) return true;
  return false;
}

function getOriginFromRequest(request) {
  const origin = request.headers.get('Origin');
  if (origin) return origin;
  
  const referer = request.headers.get('Referer');
  if (referer) {
    try {
      const url = new URL(referer);
      return url.origin;
    } catch {
      return null;
    }
  }
  return null;
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

export default {
  async fetch(request, env, ctx) {
    const requestOrigin = getOriginFromRequest(request);
    
    if (request.method === 'OPTIONS') {
      if (!isAllowedOrigin(requestOrigin)) {
        return new Response('Forbidden', { status: 403 });
      }
      return new Response(null, { headers: corsHeaders(requestOrigin) });
    }

    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405 });
    }

    if (!isAllowedOrigin(requestOrigin)) {
      return new Response(JSON.stringify({
        error: 'Forbidden',
        message: 'This proxy only accepts requests from authorized origins'
      }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const url = new URL(request.url);
    const targetUrl = url.searchParams.get('url');
    const isImageProxy = url.searchParams.get('type') === 'image';

    if (!targetUrl) {
      return new Response(JSON.stringify({
        error: 'Missing url parameter',
        usage: 'Add ?url=<encoded-url> to your request'
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders(requestOrigin)
        }
      });
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(targetUrl);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error('Invalid protocol');
      }
    } catch {
      return new Response(JSON.stringify({
        error: 'Invalid URL',
        url: targetUrl
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders(requestOrigin)
        }
      });
    }

    const cacheKey = new Request(request.url, request);
    const cache = caches.default;
    
    let cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
      const newHeaders = new Headers(cachedResponse.headers);
      newHeaders.set('Access-Control-Allow-Origin', requestOrigin);
      newHeaders.set('X-Cache', 'HIT');
      return new Response(cachedResponse.body, {
        status: cachedResponse.status,
        headers: newHeaders
      });
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);

      const acceptHeader = isImageProxy
        ? 'image/webp,image/avif,image/apng,image/*,*/*;q=0.8'
        : 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html, */*';

      const response = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          'User-Agent': BROWSER_USER_AGENT,
          'Accept': acceptHeader,
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        },
        signal: controller.signal,
        redirect: 'follow',
        cf: {
          cacheTtl: CACHE_TTL,
          cacheEverything: true
        }
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return new Response(JSON.stringify({
          error: `Upstream returned ${response.status}`,
          status: response.status,
          url: targetUrl
        }), {
          status: response.status,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders(requestOrigin)
          }
        });
      }

      const contentLength = response.headers.get('content-length');
      const maxSize = isImageProxy ? MAX_IMAGE_SIZE : MAX_FEED_SIZE;
      if (contentLength && parseInt(contentLength) > maxSize) {
        return new Response(JSON.stringify({
          error: 'Response too large',
          size: contentLength,
          maxSize: maxSize
        }), {
          status: 413,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders(requestOrigin)
          }
        });
      }

      const contentType = response.headers.get('content-type') || (isImageProxy ? 'image/jpeg' : 'application/xml');

      let responseBody;
      let responseHeaders = {
        'Content-Type': contentType,
        ...corsHeaders(requestOrigin),
        'Cache-Control': `public, max-age=${CACHE_TTL}`,
        'X-Proxied-From': targetUrl,
        'X-Cache': 'MISS'
      };

      if (isImageProxy) {
        responseBody = response.body;
        const originalLength = response.headers.get('content-length');
        if (originalLength) {
          responseHeaders['Content-Length'] = originalLength;
        }
      } else {
        responseBody = await response.text();
      }

      const proxyResponse = new Response(responseBody, {
        status: 200,
        headers: responseHeaders
      });

      ctx.waitUntil(cache.put(cacheKey, proxyResponse.clone()));

      return proxyResponse;

    } catch (error) {
      const isTimeout = error.name === 'AbortError';
      
      return new Response(JSON.stringify({
        error: isTimeout ? 'Request timeout' : 'Failed to fetch',
        message: error.message,
        url: targetUrl
      }), {
        status: isTimeout ? 504 : 502,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders(requestOrigin)
        }
      });
    }
  }
};
