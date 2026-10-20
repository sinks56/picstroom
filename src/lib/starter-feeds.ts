export interface StarterFeed {
  url: string;
  title: string;
  category: string;
  description: string;
}

export const STARTER_FEEDS: StarterFeed[] = [
  // Design & Architecture
  {
    url: 'https://www.designboom.com/feed/',
    title: 'Designboom',
    category: 'Design',
    description: 'Architecture, design, art, and technology'
  },
  {
    url: 'https://www.dezeen.com/feed/',
    title: 'Dezeen',
    category: 'Architecture',
    description: 'Architecture and design magazine'
  },
  {
    url: 'https://www.yankodesign.com/feed/',
    title: 'Yanko Design',
    category: 'Product Design',
    description: 'Modern industrial design news'
  },
  {
    url: 'https://design-milk.com/feed/',
    title: 'Design Milk',
    category: 'Design',
    description: 'Modern design, art, architecture, and interiors'
  },
  {
    url: 'https://leibal.com/feed/',
    title: 'Leibal',
    category: 'Minimalism',
    description: 'Minimalist design, architecture, and interiors'
  },
  {
    url: 'https://minimalissimo.com/feed/',
    title: 'Minimalissimo',
    category: 'Minimalism',
    description: 'Minimalism in design and lifestyle'
  },
  {
    url: 'https://www.gessato.com/feed/',
    title: 'Gessato',
    category: 'Design',
    description: 'Design, architecture, and travel'
  },
  
  // Art & Illustration
  {
    url: 'https://www.thisiscolossal.com/feed/',
    title: 'Colossal',
    category: 'Art',
    description: 'Art, design, and visual culture'
  },
  {
    url: 'https://booooooom.com/feed/',
    title: 'Booooooom',
    category: 'Art',
    description: 'Art, film, music, and photography'
  },
  {
    url: 'https://www.fubiz.net/en/feed/',
    title: 'Fubiz',
    category: 'Creative',
    description: 'Creative inspiration and pop culture'
  },
  {
    url: 'https://www.ignant.com/feed/',
    title: 'Ignant',
    category: 'Art',
    description: 'Art, design, and photography'
  },
  {
    url: 'https://mymodernmet.com/feed/',
    title: 'My Modern Met',
    category: 'Art',
    description: 'Art, design, photography, and culture'
  },
  
  // Interiors & Lifestyle
  {
    url: 'https://www.yellowtrace.com.au/feed/',
    title: 'Yellowtrace',
    category: 'Interiors',
    description: 'Interior design, architecture, and art'
  },
  {
    url: 'https://www.1stdibs.com/blogs/the-study/feed/',
    title: '1stDibs',
    category: 'Luxury',
    description: 'Luxury furniture, art, and interiors'
  },
  
  // Photography
  {
    url: 'https://www.petapixel.com/feed/',
    title: 'PetaPixel',
    category: 'Photography',
    description: 'Photography news and inspiration'
  },
  {
    url: 'https://www.adorama.com/alc/feed/',
    title: 'Adorama',
    category: 'Photography',
    description: 'Photography tutorials and gear'
  },
  
  // Creative & Culture
  {
    url: 'https://www.behance.net/feeds/projects',
    title: 'Behance',
    category: 'Portfolio',
    description: 'Creative work from designers worldwide'
  },
  {
    url: 'https://www.creativeboom.com/feed/',
    title: 'Creative Boom',
    category: 'Creative',
    description: 'Creativity and design inspiration'
  },
  {
    url: 'https://www.swiss-miss.com/feed',
    title: 'Swiss Miss',
    category: 'Design',
    description: 'Design links and inspiration'
  },
  {
    url: 'https://www.thedieline.com/feed/',
    title: 'The Dieline',
    category: 'Packaging',
    description: 'Package design and branding'
  }
];

export const FEED_CATEGORIES = [
  'Design',
  'Architecture', 
  'Art',
  'Photography',
  'Interiors',
  'Creative',
  'Product Design',
  'Minimalism',
  'Packaging',
  'Portfolio',
  'Luxury'
];
