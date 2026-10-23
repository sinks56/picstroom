import { describe, it, expect } from 'vitest';
import type { Feed, Folder, Settings } from '../../src/types';
import { buildBackup, parseImport, importableSettings } from '../../src/lib/backup';
import { exportToOPML, DEFAULT_SETTINGS } from '../../src/lib/storage';

const feeds: Feed[] = [
  { id: '2', url: 'https://b.com/feed', title: 'B', order: 1, folderId: 'fo1', lastFetched: 5, errorMessage: 'x' },
  { id: '1', url: 'https://a.com/feed', title: 'A', order: 0 }
];
const folders: Folder[] = [{ id: 'fo1', name: 'Arch', order: 0, collapsed: false }];
const settings: Settings = { ...DEFAULT_SETTINGS, viewMode: 'grid', optimizeImages: false };
const favorites = [{ imageId: 'i1', feedId: '1', url: 'https://a.com/1.jpg', sourceUrl: 'https://a.com/p', savedAt: 1 }];

describe('backup', () => {
  it('round-trips feeds in order, folders, favorites and settings', () => {
    const json = JSON.stringify(buildBackup({ settings, feeds, folders, favorites }, '1.5.0'));
    expect(json).not.toContain('errorMessage');
    const plan = parseImport(json);
    expect(plan.kind).toBe('backup');
    expect(plan.feeds.map(f => f.url)).toEqual(['https://a.com/feed', 'https://b.com/feed']);
    expect(plan.feeds[1].folderName).toBe('Arch');
    expect(plan.folders).toEqual(['Arch']);
    expect(plan.favorites).toHaveLength(1);
    expect(importableSettings(plan.settings)).toMatchObject({ viewMode: 'grid', optimizeImages: false });
    expect(importableSettings(plan.settings).proxyList).toBeUndefined();
  });

  it('reads OPML (with folders) in document order', () => {
    const plan = parseImport(exportToOPML([...feeds].sort((a, b) => a.order - b.order), folders));
    expect(plan.kind).toBe('opml');
    expect(plan.feeds.map(f => [f.url, f.title, f.folderName])).toEqual([
      ['https://a.com/feed', 'A', undefined],
      ['https://b.com/feed', 'B', 'Arch']
    ]);
  });

  it('pulls feed links out of plain text, deduped, in order', () => {
    const plan = parseImport('My feeds:\nhttps://segd.org/feed\n- https://etapes.com/feed/ (French)\nhttps://segd.org/feed');
    expect(plan.kind).toBe('urls');
    expect(plan.feeds.map(f => f.url)).toEqual(['https://segd.org/feed', 'https://etapes.com/feed/']);
  });

  it('rejects junk', () => {
    expect(() => parseImport('')).toThrow();
    expect(() => parseImport('{"foo":1}')).toThrow(/Not a PicStroom backup/);
    expect(() => parseImport('hello')).toThrow(/No feed/);
  });
});
