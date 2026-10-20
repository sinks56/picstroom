export interface FeedImage {
  id: string;
  feedId: string;
  url: string;
  thumbnailUrl?: string;
  sourceUrl: string;
  title?: string;
  width?: number;
  height?: number;
  fetchedAt: number;
}

export interface Feed {
  id: string;
  url: string;
  title: string;
  siteUrl?: string;
  description?: string;
  favicon?: string;
  folderId?: string;
  order: number;
  lastFetched?: number;
  errorMessage?: string;
}

export interface Folder {
  id: string;
  name: string;
  order: number;
  collapsed: boolean;
}

export interface FavoriteImage {
  imageId: string;
  feedId: string;
  url: string;
  thumbnailUrl?: string;
  sourceUrl: string;
  title?: string;
  savedAt: number;
}

export interface ProxyConfig {
  name: string;
  template: string;
  enabled: boolean;
}

export interface Settings {
  theme: 'light' | 'dark' | 'system';
  viewMode: 'rows' | 'grid';
  imageQuality: 'low' | 'medium' | 'high';
  minImageWidth: number;
  minImageHeight: number;
  customProxyUrl?: string;
  proxyList: ProxyConfig[];
}

export interface StarterFeed {
  url: string;
  title: string;
  category: string;
  description: string;
}

export interface ParsedFeedItem {
  title?: string;
  link?: string;
  images: string[];
  pubDate?: Date;
}

export interface ParsedFeed {
  title: string;
  description?: string;
  siteUrl?: string;
  items: ParsedFeedItem[];
}
