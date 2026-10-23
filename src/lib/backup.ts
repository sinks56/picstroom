import type { Feed, Folder, FavoriteImage, Settings } from '../types';
import { parseOPML } from './storage';

/** Portable backup of everything the user set up. Cached images are re-downloaded. */
export interface PicStroomBackup {
  app: 'PicStroom';
  format: 1;
  version: string;
  exportedAt: string;
  settings: Partial<Settings>;
  folders: Folder[];
  feeds: Pick<Feed, 'id' | 'url' | 'title' | 'siteUrl' | 'description' | 'folderId' | 'order'>[];
  favorites: FavoriteImage[];
}

export function buildBackup(data: { settings: Settings; feeds: Feed[]; folders: Folder[]; favorites: FavoriteImage[] }, version: string): PicStroomBackup {
  // Device-specific / transient fields are left out.
  const { id: _id, ...settings } = data.settings as Settings & { id?: string };
  return {
    app: 'PicStroom',
    format: 1,
    version,
    exportedAt: new Date().toISOString(),
    settings,
    folders: data.folders.map(f => ({ ...f })),
    feeds: [...data.feeds]
      .sort((a, b) => a.order - b.order)
      .map(({ id, url, title, siteUrl, description, folderId, order }) => ({ id, url, title, siteUrl, description, folderId, order })),
    favorites: data.favorites.map(f => ({ ...f }))
  };
}

export interface ImportPlan {
  kind: 'backup' | 'opml' | 'urls';
  feeds: { url: string; title?: string; siteUrl?: string; description?: string; folderName?: string }[];
  folders: string[];
  settings?: Partial<Settings>;
  favorites: FavoriteImage[];
}

const URL_RE = /https?:\/\/[^\s"'<>,]+/gi;

/**
 * Accepts a PicStroom JSON backup, an OPML file, or any text with feed URLs in it
 * (one per line, a pasted list, a diagnostics dump...). Feed order is preserved.
 */
export function parseImport(text: string): ImportPlan {
  const trimmed = text.trim().replace(/^\uFEFF/, '');
  if (!trimmed) throw new Error('Nothing to import');

  if (trimmed.startsWith('{')) {
    let data: Partial<PicStroomBackup>;
    try {
      data = JSON.parse(trimmed);
    } catch {
      throw new Error('This JSON file could not be read');
    }
    if (data.app !== 'PicStroom' || !Array.isArray(data.feeds)) throw new Error('Not a PicStroom backup');
    const folderNames = new Map((data.folders || []).map(f => [f.id, f.name]));
    const feeds = [...data.feeds]
      .filter(f => f && typeof f.url === 'string' && /^https?:\/\//i.test(f.url))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map(f => ({ url: f.url, title: f.title, siteUrl: f.siteUrl, description: f.description, folderName: f.folderId ? folderNames.get(f.folderId) : undefined }));
    const folders = [...(data.folders || [])].sort((a, b) => a.order - b.order).map(f => f.name);
    const favorites = (data.favorites || []).filter(f => f && typeof f.imageId === 'string' && typeof f.url === 'string');
    return { kind: 'backup', feeds, folders, settings: data.settings || undefined, favorites };
  }

  if (/<opml[\s>]/i.test(trimmed)) {
    const { feeds, folders } = parseOPML(trimmed);
    const names = folders.map(f => f.name);
    return {
      kind: 'opml',
      feeds: feeds.map(f => ({ url: f.url, title: f.title || undefined, siteUrl: f.siteUrl, folderName: f.folderId ? names[Number(f.folderId.replace('folder-', ''))] : undefined })),
      folders: names,
      favorites: []
    };
  }

  const seen = new Set<string>();
  const feeds: ImportPlan['feeds'] = [];
  for (const m of trimmed.match(URL_RE) || []) {
    const url = m.replace(/[).\]]+$/, '');
    if (seen.has(url)) continue;
    seen.add(url);
    feeds.push({ url });
  }
  if (!feeds.length) throw new Error('No feed addresses found');
  return { kind: 'urls', feeds, folders: [], favorites: [] };
}

/** Settings that are safe to carry to another device / install. */
export function importableSettings(s: Partial<Settings> | undefined): Partial<Settings> {
  if (!s) return {};
  const out: Partial<Settings> = {};
  if (s.theme === 'light' || s.theme === 'dark' || s.theme === 'system') out.theme = s.theme;
  if (s.viewMode === 'rows' || s.viewMode === 'grid') out.viewMode = s.viewMode;
  if (s.imageQuality === 'low' || s.imageQuality === 'medium' || s.imageQuality === 'high') out.imageQuality = s.imageQuality;
  if (typeof s.optimizeImages === 'boolean') out.optimizeImages = s.optimizeImages;
  if (typeof s.maxPerPostInGrid === 'number') out.maxPerPostInGrid = s.maxPerPostInGrid;
  if (typeof s.timeWindowDays === 'number') out.timeWindowDays = s.timeWindowDays;
  if (typeof s.minImageWidth === 'number') out.minImageWidth = s.minImageWidth;
  if (typeof s.minImageHeight === 'number') out.minImageHeight = s.minImageHeight;
  if (typeof s.customProxyUrl === 'string') out.customProxyUrl = s.customProxyUrl;
  // proxyList is left out on purpose: the built-in relay list changes between versions.
  return out;
}
