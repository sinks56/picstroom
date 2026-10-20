import type { ProxyConfig } from '../types';
import { CORS_PROXY_URL } from '../config';

export const DEFAULT_PROXIES: ProxyConfig[] = [
  {
    name: 'AllOrigins JSON',
    template: 'https://api.allorigins.win/get?url={url}',
    enabled: true
  },
  {
    name: 'AllOrigins Raw',
    template: 'https://api.allorigins.win/raw?url={url}',
    enabled: true
  }
];

export function buildProxyUrl(template: string, targetUrl: string): string {
  return template.replace('{url}', encodeURIComponent(targetUrl));
}

export interface FetchResult {
  ok: boolean;
  text?: string;
  error?: string;
  usedProxy?: string;
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchWithCorsProxy(
  url: string,
  proxies: ProxyConfig[],
  customProxyUrl?: string,
  _signal?: AbortSignal
): Promise<FetchResult> {
  const errors: string[] = [];
  
  const effectiveProxyUrl = customProxyUrl || CORS_PROXY_URL;

  // 1. Try custom/configured proxy FIRST (most reliable when deployed)
  if (effectiveProxyUrl) {
    try {
      const proxyUrl = buildProxyUrl(effectiveProxyUrl + '?url={url}', url);
      const response = await fetchWithTimeout(proxyUrl, {}, 20000);
      if (response.ok) {
        const text = await response.text();
        if (text && text.length > 100 && !text.includes('"error"')) {
          return { ok: true, text, usedProxy: 'custom' };
        }
        if (text.includes('"error"')) {
          try {
            const errJson = JSON.parse(text);
            errors.push(`Proxy: ${errJson.error || 'unknown error'}`);
          } catch {
            errors.push(`Proxy: invalid response`);
          }
        }
      } else {
        errors.push(`Proxy: ${response.status}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'failed';
      errors.push(`Proxy: ${msg}`);
    }
  }

  // 2. Try direct fetch (works for feeds with CORS headers)
  try {
    const response = await fetchWithTimeout(url, {
      headers: {
        'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*'
      }
    }, 10000);
    
    if (response.ok) {
      const text = await response.text();
      if (text && text.length > 100) {
        return { ok: true, text };
      }
    }
    errors.push(`Direct: ${response.status}`);
  } catch {
    errors.push('Direct: CORS blocked');
  }

  // 3. Try public proxies as last resort fallback
  const enabledProxies = proxies.filter(p => p.enabled);
  for (const proxy of enabledProxies) {
    try {
      const proxyUrl = buildProxyUrl(proxy.template, url);
      const response = await fetchWithTimeout(proxyUrl, {}, 15000);
      
      if (response.ok) {
        let text = await response.text();
        
        // AllOrigins JSON endpoint returns { contents: "...", status: {...} }
        if (proxy.name.includes('JSON') && text.startsWith('{')) {
          try {
            const json = JSON.parse(text);
            if (json.contents) {
              text = json.contents;
            }
          } catch {
            // Not JSON, use as-is
          }
        }
        
        if (text && text.length > 100 && !text.includes('Cloudflare') && !text.includes('Enable JavaScript')) {
          return { ok: true, text, usedProxy: proxy.name };
        }
        errors.push(`${proxy.name}: blocked/challenge`);
      } else {
        errors.push(`${proxy.name}: ${response.status}`);
      }
    } catch {
      errors.push(`${proxy.name}: timeout/error`);
    }
  }

  const errorDetails = errors.join(', ');
  const hasCustomProxy = Boolean(effectiveProxyUrl);
  
  let errorMsg = `Could not fetch feed. ${errorDetails}`;
  if (!hasCustomProxy) {
    errorMsg += '. Deploy the Cloudflare Worker proxy for better reliability (see Settings).';
  }
  
  return { ok: false, error: errorMsg };
}

export async function fetchImageWithProxy(
  url: string,
  _proxies: ProxyConfig[],
  customProxyUrl?: string,
  signal?: AbortSignal
): Promise<{ ok: boolean; blob?: Blob; error?: string }> {
  const effectiveProxyUrl = customProxyUrl || CORS_PROXY_URL;
  
  // Try direct fetch first
  try {
    const response = await fetch(url, { signal, mode: 'cors' });
    if (response.ok) {
      const blob = await response.blob();
      return { ok: true, blob };
    }
  } catch {
    // Direct fetch failed, try proxy
  }

  // Try proxy for hotlink-protected images
  if (effectiveProxyUrl) {
    try {
      const proxyUrl = `${effectiveProxyUrl}?type=image&url=${encodeURIComponent(url)}`;
      const response = await fetch(proxyUrl, { signal });
      if (response.ok) {
        const blob = await response.blob();
        return { ok: true, blob };
      }
    } catch {
      // Proxy failed
    }
  }

  return { ok: false, error: 'Failed to fetch image' };
}
