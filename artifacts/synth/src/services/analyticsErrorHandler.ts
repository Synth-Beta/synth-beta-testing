/**
 * Analytics Error Handler
 * Provides graceful error handling for analytics queries
 */

export class AnalyticsErrorHandler {
  /**
   * Safely execute a Supabase query with error handling
   */
  static async safeQuery<T>(
    queryFn: () => Promise<{ data: T | null; error: any }>,
    fallbackValue: T,
    errorMessage: string
  ): Promise<T> {
    try {
      const { data, error } = await queryFn();
      
      if (error) {
        console.error(`${errorMessage}:`, error);
        return fallbackValue;
      }
      
      return data || fallbackValue;
    } catch (error) {
      console.error(`${errorMessage} (catch):`, error);
      return fallbackValue;
    }
  }

  /**
   * Safely execute multiple queries in parallel
   */
  static async safeParallelQueries<T>(
    queries: Array<{
      queryFn: () => Promise<{ data: T | null; error: any }>;
      fallbackValue: T;
      errorMessage: string;
    }>
  ): Promise<T[]> {
    const results = await Promise.allSettled(
      queries.map(({ queryFn, fallbackValue, errorMessage }) =>
        this.safeQuery(queryFn, fallbackValue, errorMessage)
      )
    );

    return results.map((result, index) => {
      if (result.status === 'rejected') {
        console.error(`Query ${index} failed:`, result.reason);
        return queries[index].fallbackValue;
      }
      return result.value;
    });
  }

  /**
   * Handle CORS errors gracefully
   */
  static handleCORSError(error: any): boolean {
    if (error?.message?.includes('CORS') || error?.message?.includes('Access-Control-Allow-Origin')) {
      console.warn('🚨 CORS Error detected. This is likely a development server configuration issue.');
      console.warn('💡 Solution: Make sure your development server is running on the correct port (5174)');
      return true;
    }
    return false;
  }

  /**
   * Handle database query errors gracefully
   */
  static handleDatabaseError(error: any, queryName: string): boolean {
    if (error?.code === '400' || error?.status === 400) {
      console.error(`🚨 Database query error for ${queryName}:`, error);
      console.warn('💡 This might be a schema issue or missing table/column');
      return true;
    }
    return false;
  }
}
