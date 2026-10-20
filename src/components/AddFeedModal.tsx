import { useState } from 'react';
import { Modal } from './Modal';
import { useStore } from '../store';

interface AddFeedModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AddFeedModal({ isOpen, onClose }: AddFeedModalProps) {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const { addFeed } = useStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setIsLoading(true);
    setError('');

    try {
      const feed = await addFeed(url.trim(), title.trim() || undefined);
      if (feed) {
        setUrl('');
        setTitle('');
        onClose();
      } else {
        setError('Could not add feed. Please check the URL.');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setUrl('');
    setTitle('');
    setError('');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Add Feed">
      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        <div>
          <label htmlFor="feed-url" className="block text-sm font-medium mb-2">
            Feed or Site URL
          </label>
          <input
            id="feed-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com or https://example.com/feed"
            className="w-full px-4 py-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent transition-all"
            autoFocus
            autoComplete="url"
            autoCapitalize="off"
            autoCorrect="off"
          />
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            Paste a website URL or direct RSS/Atom feed URL. We'll auto-discover the feed.
          </p>
        </div>

        <div>
          <label htmlFor="feed-title" className="block text-sm font-medium mb-2">
            Custom Title (optional)
          </label>
          <input
            id="feed-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="My Favorite Blog"
            className="w-full px-4 py-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent transition-all"
          />
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={handleClose}
            className="flex-1 px-4 py-3 rounded-xl border border-[var(--color-border)] hover:bg-[var(--color-bg-tertiary)] transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!url.trim() || isLoading}
            className="flex-1 px-4 py-3 rounded-xl bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Adding...
              </>
            ) : (
              'Add Feed'
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
