import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, it, expect, beforeEach } from 'vitest';
import { openDB } from 'idb';

const NOW = Date.now();

/** Creates the database exactly as PicStroom v1.4.0 (DB_VERSION 2) left it. */
async function seedV140() {
  const db = await openDB('picstroom', 2, {
    upgrade(d) {
      const feeds = d.createObjectStore('feeds', { keyPath: 'id' });
      feeds.createIndex('order', 'order');
      feeds.createIndex('folderId', 'folderId');
      const images = d.createObjectStore('images', { keyPath: 'id' });
      images.createIndex('feedId', 'feedId');
      images.createIndex('fetchedAt', 'fetchedAt');
      d.createObjectStore('folders', { keyPath: 'id' }).createIndex('order', 'order');
      d.createObjectStore('favorites', { keyPath: 'imageId' }).createIndex('savedAt', 'savedAt');
      d.createObjectStore('settings', { keyPath: 'id' });
    }
  });
  // v1.4.0 order values after add/delete churn: duplicates and a gap.
  await db.put('feeds', { id: 'aaa', url: 'https://dezeen.com/feed', title: 'Dezeen', order: 3, lastFetched: NOW, lastFetchedPage: 2 });
  await db.put('feeds', { id: 'bbb', url: 'https://colossal.com/feed', title: 'Colossal', order: 0, lastFetched: NOW });
  await db.put('feeds', { id: 'ccc', url: 'https://segd.org/feed', title: 'SEGD', order: 3, folderId: 'fo1' });
  await db.put('folders', { id: 'fo1', name: 'Signage', order: 0, collapsed: false });
  for (let i = 0; i < 40; i++) {
    await db.put('images', { id: `img${i}`, feedId: ['aaa', 'bbb', 'ccc'][i % 3], url: `https://x.com/${i}.jpg`, sourceUrl: `https://x.com/p${i}`, pubDate: NOW - i * 3600_000, fetchedAt: NOW });
  }
  await db.put('favorites', { imageId: 'img1', feedId: 'bbb', url: 'https://x.com/1.jpg', sourceUrl: 'https://x.com/p1', savedAt: NOW });
  // v1.4.0 settings record (no fields added later).
  await db.put('settings', { id: 'main', theme: 'light', viewMode: 'grid', imageQuality: 'high', minImageWidth: 100, minImageHeight: 100, proxyList: [], timeWindowDays: 14, optimizeImages: false, maxPerPostInGrid: 10 });
  db.close();
}

async function freshModules() {
  const { vi } = await import('vitest');
  vi.resetModules();
  const storage = await import('../../src/lib/storage');
  const { useStore } = await import('../../src/store');
  return { storage, useStore };
}

beforeEach(() => {
  // Brand-new empty IndexedDB per test.
  (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
});

describe('upgrade from v1.4.0 data', () => {
  it('keeps feeds (in their visible order), folders, settings, favorites and cached images', async () => {
    await seedV140();
    const { storage, useStore } = await freshModules();
    await useStore.getState().initialize();
    const s = useStore.getState();
    expect(s.initError).toBeNull();

    // Same order v1.4.0 showed (stable sort of getAll-by-id on `order`), now unique.
    expect(s.feeds.map(f => f.title)).toEqual(['Colossal', 'Dezeen', 'SEGD']);
    expect(s.feeds.map(f => f.order)).toEqual([0, 1, 2]);
    expect(s.feeds[1].lastFetchedPage).toBe(2);
    expect(s.feeds[2].folderId).toBe('fo1');
    expect(s.folders.map(f => f.name)).toEqual(['Signage']);

    expect(s.settings).toMatchObject({ theme: 'light', viewMode: 'grid', optimizeImages: false, maxPerPostInGrid: 10 });
    expect(s.favorites.map(f => f.imageId)).toEqual(['img1']);
    expect(Object.values(s.imagesByFeed).flat()).toHaveLength(40);
    expect(s.allImages).toHaveLength(40);

    // Reorder, then "restart the app" and check everything is still there.
    await s.reorderFeed('ccc', 0);
    expect(useStore.getState().feeds.map(f => f.title)).toEqual(['SEGD', 'Colossal', 'Dezeen']);
    await new Promise(r => setTimeout(r, 20));
    storage.closeDB();

    const again = await freshModules();
    await again.useStore.getState().initialize();
    const t = again.useStore.getState();
    expect(t.feeds.map(f => f.title)).toEqual(['SEGD', 'Colossal', 'Dezeen']);
    expect(t.allImages).toHaveLength(40);
    expect(t.favorites).toHaveLength(1);
    expect(t.settings.viewMode).toBe('grid');
    again.storage.closeDB();
  });

  it('upgrades a v1 database in place (dedupes, keeps feeds)', async () => {
    const db = await openDB('picstroom', 1, {
      upgrade(d) {
        d.createObjectStore('feeds', { keyPath: 'id' }).createIndex('order', 'order');
        const images = d.createObjectStore('images', { keyPath: 'id' });
        images.createIndex('feedId', 'feedId');
        d.createObjectStore('settings', { keyPath: 'id' });
      }
    });
    await db.put('feeds', { id: 'f1', url: 'https://a.com/feed', title: 'A', order: 0 });
    await db.put('images', { id: 'x1', feedId: 'f1', url: 'https://a.com/a-300x200.jpg', sourceUrl: 'https://a.com/p', guid: 'g', fetchedAt: NOW });
    await db.put('images', { id: 'x2', feedId: 'f1', url: 'https://a.com/a.jpg', sourceUrl: 'https://a.com/p', guid: 'g', fetchedAt: NOW });
    db.close();

    const { storage, useStore } = await freshModules();
    await useStore.getState().initialize();
    const s = useStore.getState();
    expect(s.initError).toBeNull();
    expect(s.feeds.map(f => f.title)).toEqual(['A']);
    expect(s.allImages).toHaveLength(1);
    storage.closeDB();
  });

  it('import adds new feeds after existing ones and skips duplicates', async () => {
    await seedV140();
    const { storage, useStore } = await freshModules();
    const { parseImport } = await import('../../src/lib/backup');
    await useStore.getState().initialize();
    // Keep the background refresh off the network.
    useStore.setState({ loadingFeeds: new Set(['__none__']) });
    const plan = parseImport(JSON.stringify({
      app: 'PicStroom', format: 1, feeds: [
        { id: 'z', url: 'https://colossal.com/feed', title: 'Colossal', order: 0 },
        { id: 'y', url: 'https://etapes.com/feed/', title: 'Étapes', order: 1 }
      ], folders: [], favorites: [], settings: {}
    }));
    const origFetch = globalThis.fetch;
    globalThis.fetch = (() => Promise.reject(new Error('offline'))) as typeof fetch;
    try {
      const r = await useStore.getState().importData(plan);
      expect(r).toMatchObject({ added: 1, skipped: 1 });
      expect(useStore.getState().feeds.map(f => [f.title, f.order])).toEqual([['Colossal', 0], ['Dezeen', 1], ['SEGD', 2], ['Étapes', 3]]);
      expect((await storage.getFeeds()).map(f => f.title)).toEqual(['Colossal', 'Dezeen', 'SEGD', 'Étapes']);
    } finally {
      await new Promise(r => setTimeout(r, 50));
      globalThis.fetch = origFetch;
      storage.closeDB();
    }
  });
});
