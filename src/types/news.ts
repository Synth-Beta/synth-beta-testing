export interface NewsArticle {
  id: string;
  title: string;
  description: string;
  link: string;
  pubDate: string;
  source: string;
  imageUrl?: string;
  author?: string;
  relevance_score?: number; // Hidden score for sorting (0-100)
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
