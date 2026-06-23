// Request deduplication utility to prevent duplicate API calls
// This helps prevent multiple identical requests from being made simultaneously

interface PendingRequest {
  promise: Promise<any>;
  timestamp: number;
}

class RequestDeduplication {
  private pendingRequests = new Map<string, PendingRequest>();
  private readonly REQUEST_TIMEOUT = 30000; // 30 seconds

  /**
   * Deduplicate requests by key
   * If a request with the same key is already pending, return the existing promise
   * Otherwise, create a new request
   */
  async deduplicate<T>(
    key: string,
    requestFn: () => Promise<T>
  ): Promise<T> {
    // Clean up expired requests
    this.cleanupExpiredRequests();

    // Check if request is already pending
    const existing = this.pendingRequests.get(key);
    if (existing) {
      console.log(`🔄 Request deduplication: Reusing pending request for key: ${key}`);
      return existing.promise;
    }

    // Create new request
    console.log(`🆕 Request deduplication: Creating new request for key: ${key}`);
    const promise = requestFn().finally(() => {
      // Remove from pending requests when completed
      this.pendingRequests.delete(key);
    });

    // Store the pending request
    this.pendingRequests.set(key, {
      promise,
      timestamp: Date.now()
    });

    return promise;
  }

  /**
   * Clean up expired requests
   */
  private cleanupExpiredRequests(): void {
    const now = Date.now();
    for (const [key, request] of this.pendingRequests.entries()) {
      if (now - request.timestamp > this.REQUEST_TIMEOUT) {
        console.log(`🧹 Request deduplication: Cleaning up expired request for key: ${key}`);
        this.pendingRequests.delete(key);
      }
    }
  }

  /**
   * Clear all pending requests
   */
  clear(): void {
    console.log(`🧹 Request deduplication: Clearing ${this.pendingRequests.size} pending requests`);
    this.pendingRequests.clear();
  }

  /**
   * Get current pending requests count
   */
  getPendingCount(): number {
    return this.pendingRequests.size;
  }
}

// Export singleton instance
export const requestDeduplication = new RequestDeduplication();

// Helper function to generate cache keys for different types of requests
export const generateRequestKey = {
  // Events requests
  events: (params: { userId?: string; limit?: number; offset?: number }) => 
    `events_${params.userId || 'anonymous'}_${params.limit || 20}_${params.offset || 0}`,
  
  // Promotions requests
  promotions: (params: { userId?: string; tier?: string; limit?: number }) => 
    `promotions_${params.userId || 'anonymous'}_${params.tier || 'all'}_${params.limit || 10}`,
  
  // User profile requests
  profile: (userId: string) => `profile_${userId}`,
  
  // Reviews requests
  reviews: (params: { eventId?: string; userId?: string; limit?: number }) => 
    `reviews_${params.eventId || 'all'}_${params.userId || 'anonymous'}_${params.limit || 20}`,
  
  // Friends requests
  friends: (userId: string) => `friends_${userId}`,
  
  // Search requests
  search: (params: { query: string; type?: string; limit?: number }) => 
    `search_${params.query}_${params.type || 'all'}_${params.limit || 20}`,
  
  // Location requests
  location: (params: { lat: number; lng: number; radius?: number }) => 
    `location_${params.lat}_${params.lng}_${params.radius || 25}`
};
