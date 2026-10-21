const CACHE_NAME = 'picstroom-images-v1';
const MAX_MEMORY_ITEMS = 200;
const CACHE_EXPIRY_DAYS = 30;

interface MemoryCacheEntry {
  blob: Blob;
  url: string;
  accessedAt: number;
  size: number;
}

class ImageCache {
  private memoryCache = new Map<string, MemoryCacheEntry>();
  private memoryCacheSize = 0;
  private cacheReady = false;
  private cache: Cache | null = null;

  async init() {
    if (this.cacheReady) return;
    try {
      this.cache = await caches.open(CACHE_NAME);
      this.cacheReady = true;
      this.cleanupOldEntries();
    } catch (e) {
      console.warn('Cache API not available:', e);
    }
  }

  private async cleanupOldEntries() {
    if (!this.cache) return;
    
    try {
      const keys = await this.cache.keys();
      const now = Date.now();
      const expiryMs = CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
      
      for (const request of keys) {
        const response = await this.cache.match(request);
        if (response) {
          const cachedAt = response.headers.get('x-cached-at');
          if (cachedAt && now - parseInt(cachedAt) > expiryMs) {
            await this.cache.delete(request);
          }
        }
      }
    } catch (e) {
      console.warn('Cache cleanup error:', e);
    }
  }

  private evictMemoryCache() {
    if (this.memoryCache.size <= MAX_MEMORY_ITEMS) return;
    
    const entries = Array.from(this.memoryCache.entries())
      .sort((a, b) => a[1].accessedAt - b[1].accessedAt);
    
    const toRemove = entries.slice(0, Math.floor(MAX_MEMORY_ITEMS * 0.2));
    for (const [key, entry] of toRemove) {
      this.memoryCacheSize -= entry.size;
      URL.revokeObjectURL(entry.url);
      this.memoryCache.delete(key);
    }
  }

  async get(imageUrl: string): Promise<string | null> {
    const entry = this.memoryCache.get(imageUrl);
    if (entry) {
      entry.accessedAt = Date.now();
      return entry.url;
    }

    if (this.cache) {
      try {
        const response = await this.cache.match(imageUrl);
        if (response) {
          const blob = await response.blob();
          const objectUrl = URL.createObjectURL(blob);
          
          this.evictMemoryCache();
          this.memoryCache.set(imageUrl, {
            blob,
            url: objectUrl,
            accessedAt: Date.now(),
            size: blob.size
          });
          this.memoryCacheSize += blob.size;
          
          return objectUrl;
        }
      } catch (e) {
        console.warn('Cache read error:', e);
      }
    }

    return null;
  }

  async put(imageUrl: string, blob: Blob): Promise<string> {
    const objectUrl = URL.createObjectURL(blob);
    
    this.evictMemoryCache();
    this.memoryCache.set(imageUrl, {
      blob,
      url: objectUrl,
      accessedAt: Date.now(),
      size: blob.size
    });
    this.memoryCacheSize += blob.size;

    if (this.cache) {
      try {
        const response = new Response(blob, {
          headers: {
            'Content-Type': blob.type || 'image/jpeg',
            'x-cached-at': Date.now().toString()
          }
        });
        await this.cache.put(imageUrl, response);
      } catch (e) {
        console.warn('Cache write error:', e);
      }
    }

    return objectUrl;
  }

  async preload(imageUrls: string[]): Promise<void> {
    const uncached = imageUrls.filter(url => !this.memoryCache.has(url));
    
    await Promise.all(uncached.slice(0, 5).map(async (url) => {
      try {
        const cached = await this.get(url);
        if (cached) return;
        
        const response = await fetch(url, { mode: 'cors' });
        if (response.ok) {
          const blob = await response.blob();
          await this.put(url, blob);
        }
      } catch {
        // Ignore preload failures
      }
    }));
  }

  has(imageUrl: string): boolean {
    return this.memoryCache.has(imageUrl);
  }

  getStats() {
    return {
      memoryItems: this.memoryCache.size,
      memorySizeMB: (this.memoryCacheSize / (1024 * 1024)).toFixed(2),
      cacheReady: this.cacheReady
    };
  }
}

export const imageCache = new ImageCache();
