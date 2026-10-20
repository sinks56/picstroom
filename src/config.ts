/**
 * PicStroom Configuration
 * 
 * Set VITE_CORS_PROXY_URL in your .env file or environment to use your own
 * Cloudflare Worker proxy. The app will try this proxy first, then fall back
 * to direct fetch (for CORS-enabled feeds) and public proxies as last resort.
 */

export const CORS_PROXY_URL = import.meta.env.VITE_CORS_PROXY_URL || '';

export const ALLOWED_ORIGINS = [
  'https://sinks56.github.io',
  'http://localhost',
  'http://127.0.0.1'
];
