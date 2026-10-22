import { useState } from 'react';
import { Modal } from './Modal';
import { useStore } from '../store';
import { STARTER_FEEDS, FEED_CATEGORIES } from '../lib/starter-feeds';

interface DiscoverModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DiscoverModal({ isOpen, onClose }: DiscoverModalProps) {
  const { feeds, addFeed } = useStore();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [addingFeeds, setAddingFeeds] = useState<Set<string>>(new Set());
  const [addedFeeds, setAddedFeeds] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});

  const existingUrls = new Set(feeds.map(f => f.url));

  const filteredFeeds = selectedCategory
    ? STARTER_FEEDS.filter(f => f.category === selectedCategory)
    : STARTER_FEEDS;

  const handleAddFeed = async (url: string, title: string) => {
    if (addingFeeds.has(url) || existingUrls.has(url) || addedFeeds.has(url)) return;

    setAddingFeeds(prev => new Set([...prev, url]));
    setErrors(prev => ({ ...prev, [url]: '' }));
    
    try {
      const feed = await addFeed(url, title);
      if (feed) {
        setAddedFeeds(prev => new Set([...prev, url]));
      } else {
        setErrors(prev => ({ ...prev, [url]: 'Failed to add feed' }));
      }
    } catch (error) {
      setErrors(prev => ({ ...prev, [url]: 'Network error' }));
    } finally {
      setAddingFeeds(prev => {
        const next = new Set(prev);
        next.delete(url);
        return next;
      });
    }
  };

  const handleAddAll = async () => {
    for (const feed of filteredFeeds) {
      if (!existingUrls.has(feed.url) && !addedFeeds.has(feed.url)) {
        await handleAddFeed(feed.url, feed.title);
      }
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Discover Feeds" size="large">
      <div className="p-4">
        {/* Info notice */}
        <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-sm">
          <p className="text-[var(--color-text-secondary)]">
            Visual inspiration feeds for design, architecture, art, and photography.
            {!import.meta.env.VITE_CORS_PROXY_URL && ' Deploy the CORS proxy for best compatibility (see Settings).'}
          </p>
        </div>

        {/* Category filters */}
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              selectedCategory === null
                ? 'bg-[var(--color-accent)] text-[var(--color-accent-fg)]'
                : 'bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-bg-secondary)]'
            }`}
          >
            All
          </button>
          {FEED_CATEGORIES.map((category: string) => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                selectedCategory === category
                  ? 'bg-[var(--color-accent)] text-[var(--color-accent-fg)]'
                  : 'bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-bg-secondary)]'
              }`}
            >
              {category}
            </button>
          ))}
        </div>

        {/* Add all button */}
        <div className="flex justify-end mb-3">
          <button
            onClick={handleAddAll}
            className="text-sm text-[var(--color-accent)] hover:underline"
          >
            Add all {filteredFeeds.filter(f => !existingUrls.has(f.url) && !addedFeeds.has(f.url)).length} feeds
          </button>
        </div>

        {/* Feed list */}
        <div className="space-y-2">
          {filteredFeeds.map((feed) => {
            const isAdding = addingFeeds.has(feed.url);
            const isAdded = existingUrls.has(feed.url) || addedFeeds.has(feed.url);
            const error = errors[feed.url];

            return (
              <div
                key={feed.url}
                data-testid={`discover-${feed.title}`}
                className="flex items-center gap-3 p-3 rounded-lg bg-[var(--color-bg-secondary)]"
              >
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-sm">{feed.title}</h4>
                  <p className="text-xs text-[var(--color-text-muted)] truncate">
                    {feed.description}
                  </p>
                  {error && (
                    <p className="text-xs text-red-500 mt-1">{error}</p>
                  )}
                </div>

                <button
                  onClick={() => handleAddFeed(feed.url, feed.title)}
                  disabled={isAdding || isAdded}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-lg font-medium text-sm transition-colors ${
                    isAdded
                      ? 'bg-green-500/10 text-green-500'
                      : isAdding
                      ? 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)]'
                      : 'bg-[var(--color-accent)] text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)]'
                  }`}
                >
                  {isAdded ? (
                    <span className="flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                      Added
                    </span>
                  ) : isAdding ? (
                    <span className="flex items-center gap-1">
                      <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Adding
                    </span>
                  ) : (
                    'Add'
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
