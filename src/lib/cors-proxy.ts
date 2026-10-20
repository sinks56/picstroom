import type { ProxyConfig } from '../types';

export const DEFAULT_PROXIES: ProxyConfig[] = [
  {
    name: 'AllOrigins',
    template: 'https://api.allorigins.win/raw?url={url}',
    enabled: true
  },
  {
    name: 'corsproxy.io',
    template: 'https://corsproxy.io/?{url}',
    enabled: true
  },
  {
    name: 'cors.sh',
    template: 'https://cors.sh/{url}',
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

export async function fetchWithCorsProxy(
  url: string,
  proxies: ProxyConfig[],
  customProxyUrl?: string,
  signal?: AbortSignal
): Promise<FetchResult> {
  // Try direct fetch first
  try {
    const response = await fetch(url, {
      signal,
      headers: {
        'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*'
      }
    });
    if (response.ok) {
      const text = await response.text();
      return { ok: true, text };
    }
  } catch {
    // Direct fetch failed, try proxies
  }

  // Try custom proxy if set
  if (customProxyUrl) {
    try {
      const proxyUrl = buildProxyUrl(customProxyUrl, url);
      const response = await fetch(proxyUrl, { signal });
      if (response.ok) {
        const text = await response.text();
        return { ok: true, text, usedProxy: 'custom' };
      }
    } catch {
      // Custom proxy failed
    }
  }

  // Try each enabled proxy in order
  const enabledProxies = proxies.filter(p => p.enabled);
  for (const proxy of enabledProxies) {
    try {
      const proxyUrl = buildProxyUrl(proxy.template, url);
      const response = await fetch(proxyUrl, { signal });
      if (response.ok) {
        const text = await response.text();
        return { ok: true, text, usedProxy: proxy.name };
      }
    } catch {
      // This proxy failed, try next
    }
  }

  return { ok: false, error: 'All fetch attempts failed' };
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
