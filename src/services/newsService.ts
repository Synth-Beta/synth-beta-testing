import { NewsArticle, NewsSource, NewsCache } from '@/types/news';

export class NewsService {
  private static readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  private static readonly SOURCES: NewsSource[] = [
    {
      name: 'pitchfork',
      url: 'https://pitchfork.com/rss/news/',
      displayName: 'Pitchfork'
    },
    {
      name: 'rollingstone',
      url: 'https://www.rollingstone.com/music/rss/',
      displayName: 'Rolling Stone'
    },
    {
      name: 'nme',
      url: 'https://www.nme.com/music/feed/',
      displayName: 'NME'
    },
    {
      name: 'billboard',
      url: 'https://www.billboard.com/feed/rss',
      displayName: 'Billboard'
    }
  ];

  /**
   * Fetch all news articles from all sources
   */
  static async fetchAllNews(): Promise<NewsArticle[]> {
    // Check cache first
    const cached = this.getCachedNews();
    if (cached) {
      console.log('📰 Using cached news articles');
      return cached;
    }

    console.log('📰 Fetching fresh news articles from RSS feeds');
    const allArticles: NewsArticle[] = [];

    // Fetch from all sources in parallel
    const fetchPromises = this.SOURCES.map(source => this.fetchFromSource(source));
    const results = await Promise.allSettled(fetchPromises);

    // Process results
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        allArticles.push(...result.value);
        console.log(`✅ ${this.SOURCES[index].displayName}: ${result.value.length} articles`);
      } else {
        console.error(`❌ ${this.SOURCES[index].displayName}: ${result.reason}`);
      }
    });

    // Sort by publication date (newest first)
    allArticles.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());

    // Cache the results
    this.cacheNews(allArticles);

    return allArticles;
  }

  /**
   * Fetch news from a single RSS source
   */
  private static async fetchFromSource(source: NewsSource): Promise<NewsArticle[]> {
    try {
      // Use CORS proxy to avoid CORS issues
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(source.url)}`;
      const response = await fetch(proxyUrl);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const xmlText = await response.text();
      return this.parseRSSFeed(xmlText, source);
    } catch (error) {
      console.error(`Error fetching from ${source.displayName}:`, error);
      return [];
    }
  }

  /**
   * Parse RSS XML feed to NewsArticle objects
   */
  private static parseRSSFeed(xmlText: string, source: NewsSource): NewsArticle[] {
    const articles: NewsArticle[] = [];
    
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
      
      // Check for parsing errors
      const parseError = xmlDoc.querySelector('parsererror');
      if (parseError) {
        throw new Error(`XML parsing error: ${parseError.textContent}`);
      }

      const items = xmlDoc.querySelectorAll('item');
      
      items.forEach((item, index) => {
        try {
          const title = item.querySelector('title')?.textContent?.trim() || '';
          const description = item.querySelector('description')?.textContent?.trim() || '';
          const link = item.querySelector('link')?.textContent?.trim() || '';
          const pubDate = item.querySelector('pubDate')?.textContent?.trim() || '';
          const author = item.querySelector('author')?.textContent?.trim() || 
                       item.querySelector('dc\\:creator')?.textContent?.trim() || 
                       item.querySelector('creator')?.textContent?.trim() || '';
          
          // Try to extract image from description or media tags
          let imageUrl = '';
          const mediaContent = item.querySelector('media\\:content');
          const enclosure = item.querySelector('enclosure');
          
          if (mediaContent) {
            imageUrl = mediaContent.getAttribute('url') || '';
          } else if (enclosure && enclosure.getAttribute('type')?.startsWith('image/')) {
            imageUrl = enclosure.getAttribute('url') || '';
          } else {
            // Extract image from description HTML
            const imgMatch = description.match(/<img[^>]+src="([^"]+)"/i);
            if (imgMatch) {
              imageUrl = imgMatch[1];
            }
          }

          // Filter for music-related content
          if (title && link && this.isMusicRelated(title, description)) {
            articles.push({
              id: `${source.name}-${index}-${Date.now()}`,
              title: this.cleanText(title),
              description: this.cleanText(description),
              link,
              pubDate: this.parseDate(pubDate),
              source: source.displayName,
              imageUrl: imageUrl || undefined,
              author: author || undefined
            });
          }
        } catch (itemError) {
          console.error(`Error parsing item ${index} from ${source.displayName}:`, itemError);
        }
      });
    } catch (error) {
      console.error(`Error parsing RSS feed from ${source.displayName}:`, error);
    }

    return articles;
  }

  /**
   * Check if article is music-related
   */
  private static isMusicRelated(title: string, description: string): boolean {
    const text = `${title} ${description}`.toLowerCase();
    
    // Music-related keywords (positive matches)
    const musicKeywords = [
      'music', 'song', 'album', 'artist', 'band', 'concert', 'tour', 'live music',
      'musician', 'singer', 'guitarist', 'drummer', 'bassist', 'pianist', 'vocalist',
      'rock', 'pop', 'hip hop', 'rap', 'jazz', 'blues', 'country', 'electronic',
      'indie', 'alternative', 'metal', 'punk', 'reggae', 'soul', 'r&b', 'folk',
      'festival', 'gig', 'venue', 'music video', 'single', 'ep', 'soundtrack',
      'record label', 'music producer', 'dj', 'remix', 'cover', 'collaboration',
      'music industry', 'streaming', 'spotify', 'apple music', 'billboard',
      'grammy', 'mtv', 'music awards', 'chart', 'top 40', 'radio', 'playlist'
    ];
    
    // Non-music keywords to exclude (negative matches)
    const nonMusicKeywords = [
      'game', 'gaming', 'video game', 'xbox', 'playstation', 'nintendo',
      'movie', 'film', 'tv show', 'television', 'series', 'netflix',
      'sports', 'football', 'basketball', 'soccer', 'baseball', 'tennis',
      'politics', 'election', 'president', 'government', 'political',
      'technology', 'tech', 'computer', 'software', 'hardware', 'iphone',
      'business', 'economy', 'finance', 'stock', 'market', 'crypto',
      'food', 'restaurant', 'recipe', 'cooking', 'chef',
      'fashion', 'clothing', 'style', 'beauty', 'makeup',
      'travel', 'vacation', 'hotel', 'flight', 'tourism'
    ];
    
    // Check for non-music content first (higher priority)
    for (const keyword of nonMusicKeywords) {
      if (text.includes(keyword)) {
        console.log(`🚫 Filtered out non-music article: "${title}" (keyword: ${keyword})`);
        return false;
      }
    }
    
    // Check for music-related content
    for (const keyword of musicKeywords) {
      if (text.includes(keyword)) {
        console.log(`✅ Music article found: "${title}" (keyword: ${keyword})`);
        return true;
      }
    }
    
    // If no clear music or non-music keywords, default to exclude
    console.log(`❓ Unclear content filtered out: "${title}"`);
    return false;
  }

  /**
   * Clean HTML and normalize text content
   */
  private static cleanText(text: string): string {
    // Remove HTML tags
    const withoutHtml = text.replace(/<[^>]*>/g, '');
    // Decode HTML entities
    const decoded = withoutHtml
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ');
    
    return decoded.trim();
  }

  /**
   * Parse various date formats to ISO string
   */
  private static parseDate(dateStr: string): string {
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) {
        return new Date().toISOString();
      }
      return date.toISOString();
    } catch (error) {
      console.error('Error parsing date:', dateStr, error);
      return new Date().toISOString();
    }
  }

  /**
   * Get cached news if available and not expired
   */
  private static getCachedNews(): NewsArticle[] | null {
    try {
      const cached = localStorage.getItem('news-cache');
      if (!cached) return null;

      const cacheData: NewsCache = JSON.parse(cached);
      const now = Date.now();

      if (now < cacheData.expiresAt) {
        return cacheData.articles;
      } else {
        // Cache expired, remove it
        localStorage.removeItem('news-cache');
        return null;
      }
    } catch (error) {
      console.error('Error reading news cache:', error);
      localStorage.removeItem('news-cache');
      return null;
    }
  }

  /**
   * Cache news articles with expiration
   */
  private static cacheNews(articles: NewsArticle[]): void {
    try {
      const now = Date.now();
      const cacheData: NewsCache = {
        articles,
        timestamp: now,
        expiresAt: now + this.CACHE_DURATION
      };

      localStorage.setItem('news-cache', JSON.stringify(cacheData));
      console.log(`📰 Cached ${articles.length} news articles for ${this.CACHE_DURATION / 1000 / 60} minutes`);
    } catch (error) {
      console.error('Error caching news:', error);
    }
  }

  /**
   * Get available news sources
   */
  static getSources(): NewsSource[] {
    return this.SOURCES.map(source => ({ ...source }));
  }

  /**
   * Filter articles by source
   */
  static filterBySource(articles: NewsArticle[], source: string): NewsArticle[] {
    if (source === 'all') {
      return articles;
    }
    
    const sourceObj = this.SOURCES.find(s => s.name === source);
    if (!sourceObj) {
      return articles;
    }

    return articles.filter(article => article.source === sourceObj.displayName);
  }

  /**
   * Clear cache (for testing or manual refresh)
   */
  static clearCache(): void {
    localStorage.removeItem('news-cache');
    console.log('📰 News cache cleared - will fetch fresh articles with music filtering');
  }
}
