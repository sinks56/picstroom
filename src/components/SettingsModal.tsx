import { useState, useRef, useSyncExternalStore } from 'react';
import { getDiagnostics, subscribeDiagnostics, clearDiagnostics, diagnosticsReport } from '../lib/diagnostics';
import { Modal } from './Modal';
import { useStore } from '../store';
import { exportToOPML } from '../lib/storage';
import { DEFAULT_PROXIES } from '../lib/cors-proxy';
import { buildBackup, parseImport } from '../lib/backup';
import { saveTextFile, copyText } from '../lib/share-file';
import { FeedReorderList } from './FeedReorderList';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { settings, updateSettings, feeds, folders, favorites, removeFeed, reorderFeed, importData } = useStore();
  const [activeTab, setActiveTab] = useState<'appearance' | 'feeds' | 'proxy' | 'data'>('appearance');
  const [importing, setImporting] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleThemeChange = (theme: 'light' | 'dark' | 'system') => {
    updateSettings({ theme });
  };

  const stamp = () => new Date().toISOString().slice(0, 10);
  const backupText = () => JSON.stringify(buildBackup({ settings, feeds, folders, favorites }, __APP_VERSION__), null, 2);

  const flash = (msg: string) => {
    setStatus(msg);
    setTimeout(() => setStatus(s => (s === msg ? null : s)), 6000);
  };

  const handleExportBackup = async () => {
    try {
      const r = await saveTextFile(`picstroom-backup-${stamp()}.json`, backupText(), 'application/json');
      if (r !== 'cancelled') flash(`Backup with ${feeds.length} feeds ${r === 'shared' ? 'ready to save' : 'downloaded'}`);
    } catch (e) {
      flash(`Could not save the file (${(e as Error)?.message || e}). Use Copy instead.`);
    }
  };

  const handleCopyBackup = async () => {
    flash((await copyText(backupText())) ? `Backup copied (${feeds.length} feeds). Paste it somewhere safe.` : 'Copy failed');
  };

  const handleExportOPML = async () => {
    try {
      const r = await saveTextFile(`picstroom-feeds-${stamp()}.opml`, exportToOPML(feeds, folders), 'text/x-opml');
      if (r !== 'cancelled') flash(`OPML with ${feeds.length} feeds ${r === 'shared' ? 'ready to save' : 'downloaded'}`);
    } catch (e) {
      flash(`Could not save the file (${(e as Error)?.message || e})`);
    }
  };

  const runImport = async (text: string) => {
    let plan;
    try {
      plan = parseImport(text);
    } catch (e) {
      flash((e as Error).message || 'Nothing to import');
      return false;
    }
    setImporting(`Importing 0/${plan.feeds.length}`);
    try {
      const r = await importData(plan, (d, t) => setImporting(`Importing ${d}/${t}`));
      const parts = [`${r.added} feed${r.added === 1 ? '' : 's'} added`];
      if (r.skipped) parts.push(`${r.skipped} already there`);
      if (r.failed) parts.push(`${r.failed} failed`);
      if (r.favorites) parts.push(`${r.favorites} favorites`);
      flash(parts.join(', '));
      return true;
    } catch (e) {
      flash(`Import failed: ${(e as Error)?.message || e}`);
      return false;
    } finally {
      setImporting(null);
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file) return;
    await runImport(await file.text());
  };

  const handleImportPaste = async () => {
    if (await runImport(pasteText)) {
      setPasteText('');
      setPasteOpen(false);
    }
  };

  const handleDeleteAllFeeds = async () => {
    if (confirm('Are you sure you want to delete all feeds? This cannot be undone.')) {
      for (const feed of feeds) {
        await removeFeed(feed.id);
      }
    }
  };

  const handleProxyToggle = (index: number) => {
    const newProxyList = [...settings.proxyList];
    newProxyList[index] = { ...newProxyList[index], enabled: !newProxyList[index].enabled };
    updateSettings({ proxyList: newProxyList });
  };

  const handleCustomProxyChange = (value: string) => {
    updateSettings({ customProxyUrl: value || undefined });
  };

  const handleResetProxies = () => {
    updateSettings({ proxyList: DEFAULT_PROXIES, customProxyUrl: undefined });
  };

  const tabs = [
    { id: 'appearance', label: 'Appearance' },
    { id: 'feeds', label: 'Feeds' },
    { id: 'proxy', label: 'Proxy' },
    { id: 'data', label: 'Data' }
  ] as const;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Settings" size="large">
      <div className="flex border-b border-[var(--color-border)]">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'text-[var(--color-accent)] border-b-2 border-[var(--color-accent)]'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="p-6">
        {activeTab === 'appearance' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-medium mb-3">Theme</h3>
              <div className="grid grid-cols-3 gap-3">
                {(['light', 'dark', 'system'] as const).map((theme) => (
                  <button
                    key={theme}
                    onClick={() => handleThemeChange(theme)}
                    className={`p-4 rounded-xl border-2 transition-all ${
                      settings.theme === theme
                        ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10'
                        : 'border-[var(--color-border)] hover:border-[var(--color-accent)]/50'
                    }`}
                  >
                    <div className="flex flex-col items-center gap-2">
                      {theme === 'light' && (
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
                        </svg>
                      )}
                      {theme === 'dark' && (
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
                        </svg>
                      )}
                      {theme === 'system' && (
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
                        </svg>
                      )}
                      <span className="text-sm capitalize">{theme}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-medium mb-2">Images</h3>
              <label className="flex items-center justify-between py-2 border-b border-[var(--color-border)] text-sm">
                <span>
                  Optimized thumbnails
                  <span className="block text-xs text-[var(--color-text-muted)]">Resized via wsrv.nl. Much less memory and data; turn off to load originals.</span>
                </span>
                <input
                  type="checkbox"
                  checked={settings.optimizeImages !== false}
                  onChange={e => updateSettings({ optimizeImages: e.target.checked })}
                  className="w-5 h-5"
                />
              </label>
              <label className="flex items-center justify-between py-2 text-sm">
                <span>
                  Max images per post in grid
                  <span className="block text-xs text-[var(--color-text-muted)]">Stops one article flooding the grid. 0 = no limit.</span>
                </span>
                <select
                  value={settings.maxPerPostInGrid ?? 6}
                  onChange={e => updateSettings({ maxPerPostInGrid: Number(e.target.value) })}
                  className="px-2 py-1 bg-[var(--color-bg-secondary)] border border-[var(--color-border)]"
                >
                  {[3, 6, 10, 20, 0].map(n => <option key={n} value={n}>{n === 0 ? 'No limit' : n}</option>)}
                </select>
              </label>
            </div>
          </div>
        )}

        {activeTab === 'feeds' && (
          <div className="-mx-6 -mt-6">
            {feeds.length === 0 ? (
              <p className="text-[var(--color-text-muted)] text-center py-8">
                No feeds added yet
              </p>
            ) : (
              <>
                <p className="px-4 py-2.5 text-xs text-[var(--color-text-muted)]">
                  Drag <span aria-hidden="true">≡</span> or long-press a feed to move it. This is the order of the rows on the home screen.
                </p>
                <FeedReorderList feeds={feeds} onMove={reorderFeed} onRemove={removeFeed} />
              </>
            )}
          </div>
        )}

        {activeTab === 'proxy' && (
          <div className="space-y-6">
            <p className="text-sm text-[var(--color-text-muted)]">
              Most RSS feeds can't be fetched directly due to CORS restrictions. 
              Enable CORS proxies to fetch feeds through intermediary servers.
            </p>

            <div>
              <h3 className="text-sm font-medium mb-3">Public Proxies</h3>
              <div className="space-y-2">
                {settings.proxyList.map((proxy, index) => (
                  <label
                    key={proxy.name}
                    className="flex items-center justify-between p-4 rounded-xl bg-[var(--color-bg-secondary)] cursor-pointer"
                  >
                    <span className="font-medium">{proxy.name}</span>
                    <input
                      type="checkbox"
                      checked={proxy.enabled}
                      onChange={() => handleProxyToggle(index)}
                      className="w-5 h-5 rounded border-[var(--color-border)] text-[var(--color-accent)] focus:ring-[var(--color-accent)]"
                    />
                  </label>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-medium mb-3">Custom Proxy URL</h3>
              <input
                type="url"
                value={settings.customProxyUrl || ''}
                onChange={(e) => handleCustomProxyChange(e.target.value)}
                placeholder="https://your-proxy.example.com/?url={url}"
                className="w-full px-4 py-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
              />
              <p className="mt-2 text-xs text-[var(--color-text-muted)]">
                Use {'{url}'} as placeholder for the target URL. Custom proxy is tried before public proxies.
              </p>
            </div>

            <button
              onClick={handleResetProxies}
              className="text-sm text-[var(--color-accent)] hover:underline"
            >
              Reset to defaults
            </button>
          </div>
        )}

        {activeTab === 'data' && (
          <div className="space-y-6">
            <div data-testid="backup">
              <h3 className="text-sm font-medium mb-1">Backup</h3>
              <p className="text-xs text-[var(--color-text-muted)] mb-3">
                Feeds (in your order), folders, favorites and settings. Keep a copy before reinstalling the app or moving to another device.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={handleExportBackup} disabled={feeds.length === 0} className="px-3 py-2.5 border border-[var(--color-border)] hover:bg-[var(--color-bg-tertiary)] text-sm font-medium disabled:opacity-50">
                  Export feeds &amp; settings
                </button>
                <button onClick={handleCopyBackup} disabled={feeds.length === 0} className="px-3 py-2.5 border border-[var(--color-border)] hover:bg-[var(--color-bg-tertiary)] text-sm font-medium disabled:opacity-50">
                  Copy backup
                </button>
                <label className="px-3 py-2.5 border border-[var(--color-border)] hover:bg-[var(--color-bg-tertiary)] text-sm font-medium disabled:opacity-50 text-center cursor-pointer">
                  <input ref={fileInputRef} type="file" onChange={handleImportFile} className="hidden" data-testid="import-file" />
                  Import file
                </label>
                <button onClick={() => setPasteOpen(o => !o)} className="px-3 py-2.5 border border-[var(--color-border)] hover:bg-[var(--color-bg-tertiary)] text-sm font-medium disabled:opacity-50">
                  Paste to import
                </button>
              </div>
              {pasteOpen && (
                <div className="mt-2">
                  <textarea
                    value={pasteText}
                    onChange={e => setPasteText(e.target.value)}
                    placeholder="Paste a PicStroom backup, an OPML file, or feed addresses (one per line)"
                    rows={5}
                    data-testid="import-paste"
                    className="w-full p-2 text-xs font-mono bg-[var(--color-bg-secondary)] border border-[var(--color-border)] focus:outline-none"
                  />
                  <button onClick={handleImportPaste} disabled={!pasteText.trim() || !!importing} className="w-full px-3 py-2.5 border border-[var(--color-border)] hover:bg-[var(--color-bg-tertiary)] text-sm font-medium disabled:opacity-50">
                    Import
                  </button>
                </div>
              )}
              <button onClick={handleExportOPML} disabled={feeds.length === 0} className="mt-2 text-xs text-[var(--color-text-secondary)] underline disabled:opacity-50">
                Export OPML (for other RSS readers)
              </button>
              {(importing || status) && (
                <p className="mt-2 text-xs" role="status" data-testid="backup-status">{importing || status}</p>
              )}
              <p className="mt-2 text-[11px] text-[var(--color-text-muted)]">
                Import accepts a backup file, OPML, or a plain list of feed links. Feeds you already have are skipped. Cached images are not in the backup; they reload.
              </p>
            </div>

            <div>
              <h3 className="text-sm font-medium mb-3">Danger Zone</h3>
              <button
                onClick={handleDeleteAllFeeds}
                disabled={feeds.length === 0}
                className="w-full px-4 py-3 rounded-xl border border-red-500/30 text-red-500 hover:bg-red-500/10 transition-colors font-medium disabled:opacity-50"
              >
                Delete All Feeds
              </button>
            </div>

            <Diagnostics />

            <div className="pt-4 border-t border-[var(--color-border)]">
              <p className="text-xs text-[var(--color-text-muted)] text-center">
                PicStroom v{__APP_VERSION__} • All data stored locally on your device
              </p>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function Diagnostics() {
  const entries = useSyncExternalStore(subscribeDiagnostics, getDiagnostics);
  const [copied, setCopied] = useState(false);
  const errors = entries.filter(e => e.level === 'error').length;
  const copy = async () => {
    const text = diagnosticsReport();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt('Copy diagnostics', text);
    }
  };
  return (
    <div data-testid="diagnostics">
      <h3 className="text-sm font-medium mb-2">Diagnostics</h3>
      <p className="text-xs text-[var(--color-text-muted)] mb-2">
        {entries.length} entries, {errors} errors. Copy and send this if something breaks.
      </p>
      <div className="max-h-40 overflow-y-auto text-[11px] font-mono bg-[var(--color-bg-secondary)] border border-[var(--color-border)] p-2 mb-2">
        {entries.length === 0 ? 'No entries' : entries.slice(-30).reverse().map((e, i) => (
          <div key={i} className={e.level === 'error' ? 'text-red-400' : ''}>
            {new Date(e.t).toLocaleTimeString()} {e.msg}
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <button onClick={copy} className="flex-1 px-3 py-2 border border-[var(--color-border)] text-sm">{copied ? 'Copied' : 'Copy diagnostics'}</button>
        <button onClick={clearDiagnostics} className="px-3 py-2 border border-[var(--color-border)] text-sm">Clear</button>
      </div>
    </div>
  );
}
