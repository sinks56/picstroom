import { useState } from 'react';
import { Modal } from './Modal';
import { useStore } from '../store';
import type { Feed } from '../types';

interface FeedManageModalProps {
  feed: Feed | null;
  isOpen: boolean;
  onClose: () => void;
}

export function FeedManageModal({ feed, isOpen, onClose }: FeedManageModalProps) {
  const { updateFeed, removeFeed, refreshFeed, folders, loadingFeeds } = useStore();
  const [title, setTitle] = useState(feed?.title || '');
  const [folderId, setFolderId] = useState<string | undefined>(feed?.folderId);

  const isLoading = feed ? loadingFeeds.has(feed.id) : false;

  const handleSave = async () => {
    if (!feed) return;
    await updateFeed(feed.id, { 
      title: title.trim() || feed.title,
      folderId 
    });
    onClose();
  };

  const handleDelete = async () => {
    if (!feed) return;
    if (confirm(`Delete "${feed.title}"? This cannot be undone.`)) {
      await removeFeed(feed.id);
      onClose();
    }
  };

  const handleRefresh = async () => {
    if (!feed) return;
    await refreshFeed(feed.id);
  };

  const handleOpenSource = () => {
    if (feed?.siteUrl) {
      window.open(feed.siteUrl, '_blank', 'noopener,noreferrer');
    } else if (feed?.url) {
      window.open(feed.url, '_blank', 'noopener,noreferrer');
    }
  };

  if (!feed) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Manage Feed">
      <div className="p-6 space-y-6">
        {/* Feed Title */}
        <div>
          <label htmlFor="feed-title" className="block text-sm font-medium mb-2">
            Title
          </label>
          <input
            id="feed-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={feed.title}
            className="w-full px-4 py-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
          />
        </div>

        {/* Feed URL (read-only) */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Feed URL
          </label>
          <div className="px-4 py-3 rounded-xl bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] text-sm break-all">
            {feed.url}
          </div>
        </div>

        {/* Folder selection */}
        {folders.length > 0 && (
          <div>
            <label htmlFor="feed-folder" className="block text-sm font-medium mb-2">
              Folder
            </label>
            <select
              id="feed-folder"
              value={folderId || ''}
              onChange={(e) => setFolderId(e.target.value || undefined)}
              className="w-full px-4 py-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
            >
              <option value="">No folder</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Last fetched / Error */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-[var(--color-text-muted)]">
            {feed.lastFetched 
              ? `Last updated ${new Date(feed.lastFetched).toLocaleDateString()}`
              : 'Never updated'}
          </span>
          {feed.errorMessage && (
            <span className="text-red-500">{feed.errorMessage}</span>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-bg-secondary)] transition-colors disabled:opacity-50"
          >
            <svg 
              className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`}
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor" 
              strokeWidth={1.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            {isLoading ? 'Refreshing...' : 'Refresh'}
          </button>

          <button
            onClick={handleOpenSource}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-bg-secondary)] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
            Visit Site
          </button>

          <button
            onClick={handleDelete}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-red-500 hover:bg-red-500/10 transition-colors ml-auto"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
            Delete
          </button>
        </div>

        {/* Save/Cancel */}
        <div className="flex gap-3 pt-4 border-t border-[var(--color-border)]">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 rounded-xl border border-[var(--color-border)] hover:bg-[var(--color-bg-tertiary)] transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-3 rounded-xl bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] transition-colors font-medium"
          >
            Save Changes
          </button>
        </div>
      </div>
    </Modal>
  );
}
