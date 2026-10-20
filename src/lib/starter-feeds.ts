import type { StarterFeed } from '../types';

// Only include feeds that have native CORS headers or are known to work reliably
// Most feeds require a CORS proxy which is unreliable with public services
export const STARTER_FEEDS: StarterFeed[] = [
  // Feeds with native CORS headers (work directly)
  {
    url: 'https://www.designboom.com/feed/',
    title: 'Designboom',
    category: 'Design',
    description: 'Architecture, design, art and technology'
  },
  {
    url: 'https://rss.nytimes.com/services/xml/rss/nyt/Arts.xml',
    title: 'NY Times Arts',
    category: 'Art',
    description: 'Visual arts, museums, and culture coverage'
  },
  {
    url: 'https://rss.nytimes.com/services/xml/rss/nyt/Movies.xml',
    title: 'NY Times Film',
    category: 'Film',
    description: 'Film reviews and cinema coverage'
  },
  {
    url: 'https://www.wired.com/feed/rss',
    title: 'Wired',
    category: 'Tech',
    description: 'Technology, science, and culture'
  },
  {
    url: 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml',
    title: 'NY Times Home',
    category: 'News',
    description: 'Top stories with images'
  },
];

export const STARTER_CATEGORIES = [...new Set(STARTER_FEEDS.map(f => f.category))];

export function getStarterFeedsByCategory(category: string): StarterFeed[] {
  return STARTER_FEEDS.filter(f => f.category === category);
}
