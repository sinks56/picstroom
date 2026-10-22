import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';

interface HeaderProps {
  onAddFeed: () => void;
  onOpenSettings: () => void;
  onOpenFavorites: () => void;
  onOpenDiscover: () => void;
}

const Icon = ({ d, className }: { d: string; className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className={className} aria-hidden="true">
    <path strokeLinecap="square" strokeLinejoin="miter" d={d} />
  </svg>
);

const ICONS = {
  rows: 'M3 5h18M3 12h18M3 19h18',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  refresh: 'M16.02 9.35h4.99V4.36M2.99 19.64v-4.99h4.99m-4.99 0 3.18 3.18a8.25 8.25 0 0 0 13.8-3.7M4.03 9.87a8.25 8.25 0 0 1 13.8-3.7l3.18 3.18',
  discover: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm3.5-12.5-2 5-5 2 2-5 5-2Z',
  star: 'M12 3.5l2.6 5.6 6.1.6-4.6 4.1 1.3 6-5.4-3.1-5.4 3.1 1.3-6-4.6-4.1 6.1-.6z',
  add: 'M12 5v14M5 12h14',
  settings: 'M10.3 3h3.4l.5 2.4 1.7 1 2.3-.8 1.7 3-1.8 1.6v2l1.8 1.6-1.7 3-2.3-.8-1.7 1-.5 2.4h-3.4l-.5-2.4-1.7-1-2.3.8-1.7-3 1.8-1.6v-2L3.8 8.6l1.7-3 2.3.8 1.7-1zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z'
};

/**
 * Thin, true-black top bar. It sits below the status bar (safe-area inset), hides while
 * scrolling down and comes back on any upward scroll. A 1px line shows refresh progress.
 */
export function Header({ onAddFeed, onOpenSettings, onOpenFavorites, onOpenDiscover }: HeaderProps) {
  const viewMode = useStore(s => s.settings.viewMode);
  const updateSettings = useStore(s => s.updateSettings);
  const refreshAllFeeds = useStore(s => s.refreshAllFeeds);
  const progress = useStore(s => s.refreshProgress);
  const busy = useStore(s => s.loadingFeeds.size > 0);
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(window.scrollY);

  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (document.documentElement.classList.contains('scroll-locked')) return;
        const y = window.scrollY;
        const dy = y - lastY.current;
        if (y < 80) setHidden(false);
        else if (dy > 12) setHidden(true);
        else if (dy < -12) setHidden(false);
        if (Math.abs(dy) > 12 || y < 80) lastY.current = y;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  const pct = progress ? Math.max(4, Math.round((progress.done / progress.total) * 100)) : 0;

  return (
    <>
      <div className="ps-statusbar-shield" aria-hidden="true" />
      <header className={hidden ? 'ps-header ps-header-hidden' : 'ps-header'} data-testid="header">
        <div className="ps-header-row">
          <h1 className="ps-brand">PicStroom</h1>
          <nav className="ps-header-actions">
            <div className="ps-seg" role="group" aria-label="View">
              <button
                className={viewMode === 'rows' ? 'ps-icon-btn ps-on' : 'ps-icon-btn'}
                onClick={() => updateSettings({ viewMode: 'rows' })}
                aria-label="Row view"
                aria-pressed={viewMode === 'rows'}
              >
                <Icon d={ICONS.rows} />
              </button>
              <button
                className={viewMode === 'grid' ? 'ps-icon-btn ps-on' : 'ps-icon-btn'}
                onClick={() => updateSettings({ viewMode: 'grid' })}
                aria-label="Grid view"
                aria-pressed={viewMode === 'grid'}
              >
                <Icon d={ICONS.grid} />
              </button>
            </div>
            <button className="ps-icon-btn" onClick={() => refreshAllFeeds()} disabled={!!progress} aria-label="Refresh all feeds">
              <Icon d={ICONS.refresh} className={progress || busy ? 'animate-spin' : ''} />
            </button>
            <button className="ps-icon-btn" onClick={onOpenDiscover} aria-label="Discover feeds">
              <Icon d={ICONS.discover} />
            </button>
            <button className="ps-icon-btn" onClick={onOpenFavorites} aria-label="Favorites">
              <Icon d={ICONS.star} />
            </button>
            <button className="ps-icon-btn" onClick={onAddFeed} aria-label="Add feed">
              <Icon d={ICONS.add} />
            </button>
            <button className="ps-icon-btn" onClick={onOpenSettings} aria-label="Settings">
              <Icon d={ICONS.settings} />
            </button>
          </nav>
        </div>
        <div className="ps-progress" style={{ width: progress ? `${pct}%` : 0, opacity: progress ? 1 : 0 }} />
      </header>
    </>
  );
}
