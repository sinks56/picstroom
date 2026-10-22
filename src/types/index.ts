export interface FeedImage {
  id: string;
  feedId: string;
  url: string;
  thumbnailUrl?: string;
  sourceUrl: string;
  title?: string;
  guid?: string;
  width?: number;
  height?: number;
  pubDate?: number;
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
  lastFetchedPage?: number;
  /** Set when a page parsed fine but contained nothing new (true end of the archive). */
  noMorePages?: boolean;
  noMorePagesAt?: number;
  /** Consecutive failures fetching the next page; drives exponential backoff. */
  pageFailures?: number;
  nextPageRetryAt?: number;
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
  timeWindowDays: number;
  /** Serve grid/row thumbnails and viewer images through a resizing image proxy. */
  optimizeImages?: boolean;
  /** Max images from one post in the combined grid (0 = unlimited). */
  maxPerPostInGrid?: number;
}

export interface StarterFeed {
  url: string;
  title: string;
  category: string;
  description: string;
}

export interface ParsedImage {
  url: string;
  thumb?: string;
  width?: number;
  height?: number;
}

export interface ParsedFeedItem {
  title?: string;
  link?: string;
  guid?: string;
  images: ParsedImage[];
  pubDate?: Date;
}

export interface ParsedFeed {
  title: string;
  description?: string;
  siteUrl?: string;
  items: ParsedFeedItem[];
}
