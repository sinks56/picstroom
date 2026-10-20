import { useState } from 'react';
import { Modal } from './Modal';
import { useStore } from '../store';
import { STARTER_FEEDS, STARTER_CATEGORIES } from '../lib/starter-feeds';

interface DiscoverModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DiscoverModal({ isOpen, onClose }: DiscoverModalProps) {
  const { feeds, addFeed } = useStore();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [addingFeeds, setAddingFeeds] = useState<Set<string>>(new Set());
  const [addedFeeds, setAddedFeeds] = useState<Set<string>>(new Set());

  const existingUrls = new Set(feeds.map(f => f.url));

  const filteredFeeds = selectedCategory
    ? STARTER_FEEDS.filter(f => f.category === selectedCategory)
    : STARTER_FEEDS;

  const handleAddFeed = async (url: string, title: string) => {
    if (addingFeeds.has(url) || existingUrls.has(url) || addedFeeds.has(url)) return;

    setAddingFeeds(prev => new Set([...prev, url]));
    
    try {
      const feed = await addFeed(url, title);
      if (feed) {
        setAddedFeeds(prev => new Set([...prev, url]));
      }
    } catch (error) {
      console.error('Failed to add feed:', error);
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

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'Design':
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" />
          </svg>
        );
      case 'Architecture':
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
          </svg>
        );
      case 'Photography':
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
          </svg>
        );
      case 'Illustration':
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.098 19.902a3.75 3.75 0 005.304 0l6.401-6.402M6.75 21A3.75 3.75 0 013 17.25V4.125C3 3.504 3.504 3 4.125 3h5.25c.621 0 1.125.504 1.125 1.125v4.072M6.75 21a3.75 3.75 0 003.75-3.75V8.197M6.75 21h13.125c.621 0 1.125-.504 1.125-1.125v-5.25c0-.621-.504-1.125-1.125-1.125h-4.072M10.5 8.197l2.88-2.88c.438-.439 1.15-.439 1.59 0l3.712 3.713c.44.44.44 1.152 0 1.59l-2.879 2.88M6.75 17.25h.008v.008H6.75v-.008z" />
          </svg>
        );
      default:
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
          </svg>
        );
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Discover Feeds" size="large">
      <div className="p-4">
        {/* Category filters */}
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              selectedCategory === null
                ? 'bg-[var(--color-accent)] text-white'
                : 'bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-bg-secondary)]'
            }`}
          >
            All
          </button>
          {STARTER_CATEGORIES.map((category) => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors flex items-center gap-2 ${
                selectedCategory === category
                  ? 'bg-[var(--color-accent)] text-white'
                  : 'bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-bg-secondary)]'
              }`}
            >
              {getCategoryIcon(category)}
              {category}
            </button>
          ))}
        </div>

        {/* Add all button */}
        <div className="flex justify-end mb-4">
          <button
            onClick={handleAddAll}
            className="text-sm text-[var(--color-accent)] hover:underline"
          >
            Add all {filteredFeeds.filter(f => !existingUrls.has(f.url) && !addedFeeds.has(f.url)).length} feeds
          </button>
        </div>

        {/* Feed list */}
        <div className="space-y-3">
          {filteredFeeds.map((feed) => {
            const isAdding = addingFeeds.has(feed.url);
            const isAdded = existingUrls.has(feed.url) || addedFeeds.has(feed.url);

            return (
              <div
                key={feed.url}
                className="flex items-center gap-4 p-4 rounded-xl bg-[var(--color-bg-secondary)]"
              >
                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-[var(--color-bg-tertiary)] flex items-center justify-center">
                  {getCategoryIcon(feed.category)}
                </div>
                
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium">{feed.title}</h4>
                  <p className="text-sm text-[var(--color-text-muted)] truncate">
                    {feed.description}
                  </p>
                </div>

                <button
                  onClick={() => handleAddFeed(feed.url, feed.title)}
                  disabled={isAdding || isAdded}
                  className={`flex-shrink-0 px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                    isAdded
                      ? 'bg-green-500/10 text-green-500'
                      : isAdding
                      ? 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)]'
                      : 'bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)]'
                  }`}
                >
                  {isAdded ? (
                    <span className="flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                      Added
                    </span>
                  ) : isAdding ? (
                    <span className="flex items-center gap-1">
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Adding...
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
