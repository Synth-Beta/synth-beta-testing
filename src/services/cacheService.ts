/**
 * Simple in-memory cache service for API responses
 * Provides TTL-based caching with automatic expiration
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
}

class CacheService {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private maxSize: number = 1000; // Maximum number of cache entries

  /**
   * Get cached data if it exists and hasn't expired
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }

    const now = Date.now();
    const age = now - entry.timestamp;

    if (age > entry.ttl) {
      // Entry has expired, remove it
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  /**
   * Set cache entry with TTL
   */
  set<T>(key: string, data: T, ttlMs: number): void {
    // If cache is full, remove oldest entries (simple FIFO)
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttlMs,
    });
  }

  /**
   * Remove a specific cache entry
   */
  delete(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Clear cache entries matching a pattern (prefix)
   */
  clearPattern(pattern: string): void {
    const keysToDelete: string[] = [];
    for (const key of this.cache.keys()) {
      if (key.startsWith(pattern)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => this.cache.delete(key));
  }

  /**
   * Remove expired entries (cleanup method)
   */
  cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      const age = now - entry.timestamp;
      if (age > entry.ttl) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.cache.delete(key));
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const now = Date.now();
    let expired = 0;
    let active = 0;

    for (const entry of this.cache.values()) {
      const age = now - entry.timestamp;
      if (age > entry.ttl) {
        expired++;
      } else {
        active++;
      }
    }

    return {
      total: this.cache.size,
      active,
      expired,
    };
  }
}

// Singleton instance
export const cacheService = new CacheService();

// Auto-cleanup every 5 minutes
if (typeof window !== 'undefined') {
  setInterval(() => {
    cacheService.cleanup();
  }, 5 * 60 * 1000); // 5 minutes
}

/**
 * Cache key generators for common use cases
 */
export const CacheKeys = {
  connectionDegree: (userId: string, degree: 1 | 2 | 3) => 
    `connection_degree_${degree}_${userId}`,
  connectionInterests: (userId: string) => 
    `connection_interests_${userId}`,
  reviews: (userId: string, limit: number, offset: number) => 
    `reviews_${userId}_${limit}_${offset}`,
  chatPreviews: (userId: string) => 
    `chat_previews_${userId}`,
  userProfile: (userId: string) => 
    `user_profile_${userId}`,
  notifications: (userId: string, limit: number) => 
    `notifications_${userId}_${limit}`,
  messages: (chatId: string) => 
    `messages_${chatId}`,
};

/**
 * Cache TTL constants (in milliseconds)
 */
export const CacheTTL = {
  CONNECTION_DATA: 10 * 60 * 1000, // 10 minutes
  REVIEWS: 3 * 60 * 1000, // 3 minutes
  CHAT_PREVIEWS: 2 * 60 * 1000, // 2 minutes
  USER_PROFILE: 5 * 60 * 1000, // 5 minutes
  NOTIFICATIONS: 2 * 60 * 1000, // 2 minutes
  MESSAGES: 1 * 60 * 1000, // 1 minute (messages change frequently)
};

