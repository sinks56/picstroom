/**
 * PicStroom CORS Proxy Worker
 * 
 * A simple Cloudflare Worker that proxies RSS feed requests
 * to bypass CORS restrictions in the browser.
 * 
 * Deploy this worker to Cloudflare and use it as your custom proxy URL
 * in PicStroom settings.
 */

const ALLOWED_CONTENT_TYPES = [
  'application/rss+xml',
  'application/atom+xml',
  'application/xml',
  'text/xml',
  'application/xhtml+xml',
  'text/html'
];

const MAX_FETCH_SIZE = 10 * 1024 * 1024; // 10MB limit

export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400'
        }
      });
    }

    // Only allow GET requests
    if (request.method !== 'GET') {
      return new Response('Method not allowed', { 
        status: 405,
        headers: { 'Access-Control-Allow-Origin': '*' }
      });
    }

    const url = new URL(request.url);
    const targetUrl = url.searchParams.get('url');

    if (!targetUrl) {
      return new Response(JSON.stringify({
        error: 'Missing url parameter',
        usage: 'Add ?url=<encoded-url> to your request'
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // Validate URL
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
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'PicStroom/1.0 (RSS Reader; +https://picstroom.app)',
          'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html, */*'
        },
        signal: controller.signal,
        redirect: 'follow'
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
            'Access-Control-Allow-Origin': '*'
          }
        });
      }

      // Check content length
      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength) > MAX_FETCH_SIZE) {
        return new Response(JSON.stringify({
          error: 'Response too large',
          size: contentLength,
          maxSize: MAX_FETCH_SIZE
        }), {
          status: 413,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }

      const body = await response.text();

      // Determine content type
      const contentType = response.headers.get('content-type') || 'application/xml';

      return new Response(body, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Expose-Headers': 'Content-Type, Content-Length',
          'Cache-Control': 'public, max-age=300',
          'X-Proxied-From': targetUrl
        }
      });

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
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
  }
};
