export interface NewsArticle {
  id: string;
  title: string;
  description: string;
  link: string;
  pubDate: string;
  source: string;
  imageUrl?: string;
  author?: string;
}

export interface NewsSource {
  name: string;
  url: string;
  displayName: string;
}

export interface NewsCache {
  articles: NewsArticle[];
  timestamp: number;
  expiresAt: number;
}
