import { openDB, type IDBPDatabase } from 'idb';
import type { Feed, FeedImage, Folder, FavoriteImage, Settings } from '../types';
import { DEFAULT_PROXIES } from './cors-proxy';

const DB_NAME = 'picstroom';
const DB_VERSION = 1;

interface PicStroomDB {
  feeds: Feed;
  images: FeedImage;
  folders: Folder;
  favorites: FavoriteImage;
  settings: Settings;
}

let db: IDBPDatabase<any> | null = null;

export async function initDB(): Promise<IDBPDatabase<any>> {
  if (db) return db;

  db = await openDB<PicStroomDB>(DB_NAME, DB_VERSION, {
    upgrade(database) {
      // Feeds store
      if (!database.objectStoreNames.contains('feeds')) {
        const feedsStore = database.createObjectStore('feeds', { keyPath: 'id' });
        feedsStore.createIndex('order', 'order');
        feedsStore.createIndex('folderId', 'folderId');
      }

      // Images store
      if (!database.objectStoreNames.contains('images')) {
        const imagesStore = database.createObjectStore('images', { keyPath: 'id' });
        imagesStore.createIndex('feedId', 'feedId');
        imagesStore.createIndex('fetchedAt', 'fetchedAt');
      }

      // Folders store
      if (!database.objectStoreNames.contains('folders')) {
        const foldersStore = database.createObjectStore('folders', { keyPath: 'id' });
        foldersStore.createIndex('order', 'order');
      }

      // Favorites store
      if (!database.objectStoreNames.contains('favorites')) {
        const favoritesStore = database.createObjectStore('favorites', { keyPath: 'imageId' });
        favoritesStore.createIndex('savedAt', 'savedAt');
      }

      // Settings store (single object)
      if (!database.objectStoreNames.contains('settings')) {
        database.createObjectStore('settings', { keyPath: 'id' });
      }
    }
  });

  return db;
}

// Settings
export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  viewMode: 'rows',
  imageQuality: 'high',
  minImageWidth: 100,
  minImageHeight: 100,
  proxyList: DEFAULT_PROXIES
};

export async function getSettings(): Promise<Settings> {
  const database = await initDB();
  const settings = await database.get('settings', 'main');
  return settings || DEFAULT_SETTINGS;
}

export async function saveSettings(settings: Settings): Promise<void> {
  const database = await initDB();
  await database.put('settings', { ...settings, id: 'main' });
}

// Feeds
export async function getFeeds(): Promise<Feed[]> {
  const database = await initDB();
  const feeds = await database.getAll('feeds');
  return feeds.sort((a, b) => a.order - b.order);
}

export async function saveFeed(feed: Feed): Promise<void> {
  const database = await initDB();
  await database.put('feeds', feed);
}

export async function deleteFeed(feedId: string): Promise<void> {
  const database = await initDB();
  await database.delete('feeds', feedId);
  
  // Delete associated images
  const images = await database.getAllFromIndex('images', 'feedId', feedId);
  for (const image of images) {
    await database.delete('images', image.id);
  }
}

export async function updateFeedOrder(feedId: string, newOrder: number): Promise<void> {
  const database = await initDB();
  const feed = await database.get('feeds', feedId);
  if (feed) {
    feed.order = newOrder;
    await database.put('feeds', feed);
  }
}

// Images
export async function getImagesByFeed(feedId: string): Promise<FeedImage[]> {
  const database = await initDB();
  const images = await database.getAllFromIndex('images', 'feedId', feedId);
  return images.sort((a, b) => b.fetchedAt - a.fetchedAt);
}

export async function getAllImages(): Promise<FeedImage[]> {
  const database = await initDB();
  const images = await database.getAll('images');
  return images.sort((a, b) => b.fetchedAt - a.fetchedAt);
}

export async function saveImages(images: FeedImage[]): Promise<void> {
  const database = await initDB();
  const tx = database.transaction('images', 'readwrite');
  for (const image of images) {
    await tx.store.put(image);
  }
  await tx.done;
}

export async function clearFeedImages(feedId: string): Promise<void> {
  const database = await initDB();
  const images = await database.getAllFromIndex('images', 'feedId', feedId);
  const tx = database.transaction('images', 'readwrite');
  for (const image of images) {
    await tx.store.delete(image.id);
  }
  await tx.done;
}

// Folders
export async function getFolders(): Promise<Folder[]> {
  const database = await initDB();
  const folders = await database.getAll('folders');
  return folders.sort((a, b) => a.order - b.order);
}

export async function saveFolder(folder: Folder): Promise<void> {
  const database = await initDB();
  await database.put('folders', folder);
}

export async function deleteFolder(folderId: string): Promise<void> {
  const database = await initDB();
  await database.delete('folders', folderId);
  
  // Unset folderId on feeds in this folder
  const feeds = await database.getAllFromIndex('feeds', 'folderId', folderId);
  const tx = database.transaction('feeds', 'readwrite');
  for (const feed of feeds) {
    feed.folderId = undefined;
    await tx.store.put(feed);
  }
  await tx.done;
}

// Favorites
export async function getFavorites(): Promise<FavoriteImage[]> {
  const database = await initDB();
  const favorites = await database.getAll('favorites');
  return favorites.sort((a, b) => b.savedAt - a.savedAt);
}

export async function addFavorite(favorite: FavoriteImage): Promise<void> {
  const database = await initDB();
  await database.put('favorites', favorite);
}

export async function removeFavorite(imageId: string): Promise<void> {
  const database = await initDB();
  await database.delete('favorites', imageId);
}

export async function isFavorite(imageId: string): Promise<boolean> {
  const database = await initDB();
  const favorite = await database.get('favorites', imageId);
  return !!favorite;
}

// OPML Import/Export
export function exportToOPML(feeds: Feed[], folders: Folder[]): string {
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<opml version="2.0">',
    '  <head>',
    '    <title>PicStroom Feeds</title>',
    `    <dateCreated>${new Date().toUTCString()}</dateCreated>`,
    '  </head>',
    '  <body>'
  ];

  const folderMap = new Map(folders.map(f => [f.id, f]));
  const feedsByFolder = new Map<string | undefined, Feed[]>();

  for (const feed of feeds) {
    const folderId = feed.folderId;
    if (!feedsByFolder.has(folderId)) {
      feedsByFolder.set(folderId, []);
    }
    feedsByFolder.get(folderId)!.push(feed);
  }

  // Feeds without folder
  const rootFeeds = feedsByFolder.get(undefined) || [];
  for (const feed of rootFeeds) {
    lines.push(`    <outline type="rss" text="${escapeXml(feed.title)}" xmlUrl="${escapeXml(feed.url)}"${feed.siteUrl ? ` htmlUrl="${escapeXml(feed.siteUrl)}"` : ''}/>`);
  }

  // Feeds in folders
  for (const [folderId, folderFeeds] of feedsByFolder) {
    if (folderId === undefined) continue;
    const folder = folderMap.get(folderId);
    if (!folder) continue;

    lines.push(`    <outline text="${escapeXml(folder.name)}">`);
    for (const feed of folderFeeds) {
      lines.push(`      <outline type="rss" text="${escapeXml(feed.title)}" xmlUrl="${escapeXml(feed.url)}"${feed.siteUrl ? ` htmlUrl="${escapeXml(feed.siteUrl)}"` : ''}/>`);
    }
    lines.push('    </outline>');
  }

  lines.push('  </body>');
  lines.push('</opml>');

  return lines.join('\n');
}

export function parseOPML(opmlText: string): { feeds: Omit<Feed, 'id' | 'order'>[]; folders: Omit<Folder, 'id' | 'order'>[] } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(opmlText, 'text/xml');
  
  const feeds: Omit<Feed, 'id' | 'order'>[] = [];
  const folders: Omit<Folder, 'id' | 'order'>[] = [];
  
  function processOutline(outline: Element, folderId?: string) {
    const text = outline.getAttribute('text') || outline.getAttribute('title') || '';
    const xmlUrl = outline.getAttribute('xmlUrl');
    const htmlUrl = outline.getAttribute('htmlUrl');
    
    const children = outline.querySelectorAll(':scope > outline');
    
    if (xmlUrl) {
      feeds.push({
        url: xmlUrl,
        title: text,
        siteUrl: htmlUrl || undefined,
        folderId
      });
    } else if (children.length > 0) {
      const newFolderId = `folder-${folders.length}`;
      folders.push({
        name: text,
        collapsed: false
      });
      
      for (const child of children) {
        processOutline(child, newFolderId);
      }
    }
  }
  
  const body = doc.querySelector('body');
  if (body) {
    const outlines = body.querySelectorAll(':scope > outline');
    for (const outline of outlines) {
      processOutline(outline);
    }
  }
  
  return { feeds, folders };
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
