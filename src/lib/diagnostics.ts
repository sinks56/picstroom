/**
 * Small in-app diagnostics log: uncaught errors, unhandled rejections and explicit
 * warnings, kept in a ring buffer and mirrored to localStorage so a crash report can be
 * copied from Settings after the app was restarted.
 */
export interface DiagEntry {
  t: number;
  level: 'error' | 'warn' | 'info';
  msg: string;
  detail?: string;
}

const KEY = 'picstroom-diagnostics';
const MAX_ENTRIES = 150;
const MAX_FIELD = 600;

let entries: DiagEntry[] = load();
let persistTimer: number | undefined;
const listeners = new Set<() => void>();

function load(): DiagEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as DiagEntry[]).slice(-MAX_ENTRIES) : [];
  } catch {
    return [];
  }
}

function persist() {
  if (persistTimer) return;
  persistTimer = window.setTimeout(() => {
    persistTimer = undefined;
    try {
      localStorage.setItem(KEY, JSON.stringify(entries));
    } catch {
      // Storage full or unavailable: keep in memory only.
    }
  }, 500);
}

function clip(s: unknown): string {
  const str = typeof s === 'string' ? s : s instanceof Error ? `${s.name}: ${s.message}` : safeStringify(s);
  return str.length > MAX_FIELD ? str.slice(0, MAX_FIELD) + '…' : str;
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export function logDiag(level: DiagEntry['level'], msg: unknown, detail?: unknown) {
  const entry: DiagEntry = { t: Date.now(), level, msg: clip(msg) };
  if (detail !== undefined) entry.detail = clip(detail instanceof Error ? detail.stack || detail.message : detail);
  // Collapse bursts of the identical message.
  const last = entries[entries.length - 1];
  if (last && last.msg === entry.msg && entry.t - last.t < 2000) return;
  // New array each time so useSyncExternalStore subscribers see a fresh snapshot.
  entries = entries.length >= MAX_ENTRIES ? [...entries.slice(1 - MAX_ENTRIES), entry] : [...entries, entry];
  persist();
  listeners.forEach(l => l());
}

export function getDiagnostics(): DiagEntry[] {
  return entries;
}

export function clearDiagnostics() {
  entries = [];
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  listeners.forEach(l => l());
}

export function subscribeDiagnostics(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function diagnosticsReport(extra: Record<string, unknown> = {}): string {
  const mem = (performance as unknown as { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
  const header = {
    app: `PicStroom ${__APP_VERSION__}`,
    ua: navigator.userAgent,
    viewport: `${window.innerWidth}x${window.innerHeight}@${window.devicePixelRatio}`,
    heapMB: mem ? Math.round(mem.usedJSHeapSize / 1e6) : undefined,
    time: new Date().toISOString(),
    ...extra
  };
  const lines = entries.map(e => `${new Date(e.t).toISOString()} [${e.level}] ${e.msg}${e.detail ? `\n    ${e.detail.replace(/\n/g, '\n    ')}` : ''}`);
  return `${JSON.stringify(header, null, 2)}\n\n${lines.join('\n') || '(no entries)'}`;
}

const RELOAD_FLAG = 'picstroom-chunk-reload';

function isChunkLoadError(msg: string): boolean {
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError/i.test(msg);
}

/** Reload once per session when a code chunk can't be loaded (stale service worker). */
function reloadForStaleChunk(reason: string) {
  try {
    if (sessionStorage.getItem(RELOAD_FLAG)) return;
    sessionStorage.setItem(RELOAD_FLAG, '1');
  } catch {
    /* ignore */
  }
  logDiag('warn', 'Reloading after chunk load failure', reason);
  window.location.reload();
}

export function installGlobalErrorCapture() {
  window.addEventListener('error', (e: ErrorEvent) => {
    // Resource errors (failed <img>) don't bubble as ErrorEvent with a message; skip them.
    if (!e.message) return;
    logDiag('error', e.message, e.error || `${e.filename}:${e.lineno}:${e.colno}`);
    if (isChunkLoadError(e.message)) reloadForStaleChunk(e.message);
  });
  window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    const reason = e.reason;
    const msg = reason instanceof Error ? `${reason.name}: ${reason.message}` : clip(reason);
    logDiag('error', `Unhandled rejection: ${msg}`, reason instanceof Error ? reason : undefined);
    if (isChunkLoadError(msg)) reloadForStaleChunk(msg);
  });
  window.addEventListener('vite:preloadError', (e: Event) => {
    e.preventDefault();
    reloadForStaleChunk('vite:preloadError');
  });
  // A successful start clears the one-shot reload guard.
  window.setTimeout(() => {
    try {
      sessionStorage.removeItem(RELOAD_FLAG);
    } catch {
      /* ignore */
    }
  }, 10_000);
}
