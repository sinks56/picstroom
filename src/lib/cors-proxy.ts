import type { ProxyConfig } from '../types';

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

  // Try direct fetch first (works for feeds with CORS headers like Designboom, NYTimes)
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
  } catch (e) {
    errors.push('Direct: CORS blocked');
  }

  // Try custom proxy if set
  if (customProxyUrl) {
    try {
      const proxyUrl = buildProxyUrl(customProxyUrl, url);
      const response = await fetchWithTimeout(proxyUrl, {}, 15000);
      if (response.ok) {
        const text = await response.text();
        if (text && text.length > 100) {
          return { ok: true, text, usedProxy: 'custom' };
        }
      }
      errors.push(`Custom proxy: ${response.status}`);
    } catch (e) {
      errors.push('Custom proxy: failed');
    }
  }

  // Try each enabled proxy in order
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
    } catch (e) {
      errors.push(`${proxy.name}: timeout/error`);
    }
  }

  // Provide detailed error message
  const errorDetails = errors.join(', ');
  return { 
    ok: false, 
    error: `Could not fetch feed. This feed may not support cross-origin requests. Try deploying your own CORS proxy (see Settings). Details: ${errorDetails}`
  };
}

export async function fetchImageWithProxy(
  url: string,
  _proxies: ProxyConfig[],
  customProxyUrl?: string,
  signal?: AbortSignal
): Promise<{ ok: boolean; blob?: Blob; error?: string }> {
  // Try direct fetch first
  try {
    const response = await fetch(url, { signal, mode: 'cors' });
    if (response.ok) {
      const blob = await response.blob();
      return { ok: true, blob };
    }
  } catch {
    // Direct fetch failed
  }

  // For images, we usually don't need proxies as most image CDNs have proper CORS
  // But provide fallback anyway
  if (customProxyUrl) {
    try {
      const proxyUrl = buildProxyUrl(customProxyUrl, url);
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
