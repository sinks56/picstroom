import type { StarterFeed } from '../types';

export const STARTER_FEEDS: StarterFeed[] = [
  // Design
  {
    url: 'https://www.designboom.com/feed/',
    title: 'Designboom',
    category: 'Design',
    description: 'Architecture, design, art, and technology'
  },
  {
    url: 'https://www.dezeen.com/feed/',
    title: 'Dezeen',
    category: 'Design',
    description: 'Architecture and design magazine'
  },
  {
    url: 'https://www.itsnicethat.com/rss',
    title: "It's Nice That",
    category: 'Design',
    description: 'Creative inspiration across disciplines'
  },
  {
    url: 'https://abduzeedo.com/feed',
    title: 'Abduzeedo',
    category: 'Design',
    description: 'Design inspiration and tutorials'
  },

  // Architecture
  {
    url: 'https://www.archdaily.com/feed',
    title: 'ArchDaily',
    category: 'Architecture',
    description: 'The world\'s most visited architecture website'
  },
  {
    url: 'https://www.contemporist.com/feed/',
    title: 'Contemporist',
    category: 'Architecture',
    description: 'Contemporary architecture and design'
  },

  // Photography
  {
    url: 'https://www.booooooom.com/feed/',
    title: 'Booooooom',
    category: 'Photography',
    description: 'Art, photography, design, and film'
  },
  {
    url: 'https://petapixel.com/feed/',
    title: 'PetaPixel',
    category: 'Photography',
    description: 'Photography news and inspiration'
  },
  {
    url: 'https://www.thisiscolossal.com/feed/',
    title: 'Colossal',
    category: 'Photography',
    description: 'Art, design, and visual culture'
  },

  // Illustration & Art
  {
    url: 'https://www.juxtapoz.com/feed/',
    title: 'Juxtapoz',
    category: 'Illustration',
    description: 'Art and culture magazine'
  },
  {
    url: 'https://www.illustrationage.com/feed/',
    title: 'Illustration Age',
    category: 'Illustration',
    description: 'Illustration news and inspiration'
  },

  // Product Design
  {
    url: 'https://www.yankodesign.com/feed/',
    title: 'Yanko Design',
    category: 'Product Design',
    description: 'Modern industrial design news'
  },
  {
    url: 'https://design-milk.com/feed/',
    title: 'Design Milk',
    category: 'Product Design',
    description: 'Modern design and architecture'
  },

  // Fashion & Lifestyle
  {
    url: 'https://hypebeast.com/feed',
    title: 'Hypebeast',
    category: 'Fashion',
    description: 'Fashion, sneakers, and culture'
  },

  // Interior Design
  {
    url: 'https://www.yatzer.com/feed/rss',
    title: 'Yatzer',
    category: 'Interior',
    description: 'Architecture, design, and art'
  },

  // Typography & Graphic Design  
  {
    url: 'https://fontsinuse.com/feed',
    title: 'Fonts In Use',
    category: 'Typography',
    description: 'Typography and lettering in the wild'
  }
];

export const STARTER_CATEGORIES = [...new Set(STARTER_FEEDS.map(f => f.category))];

export function getStarterFeedsByCategory(category: string): StarterFeed[] {
  return STARTER_FEEDS.filter(f => f.category === category);
}
