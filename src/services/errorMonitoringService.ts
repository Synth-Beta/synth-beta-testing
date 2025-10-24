/**
 * Error Monitoring Service
 * 
 * Centralized error logging and monitoring for the Synth application.
 * Replaces console.error with structured logging to Supabase.
 */

import { supabase } from '@/integrations/supabase/client';

export interface SystemError {
  id?: string;
  context: string;
  error_message: string;
  error_stack?: string;
  metadata?: Record<string, any>;
  user_id?: string;
  timestamp: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: 'validation' | 'network' | 'database' | 'authentication' | 'business_logic' | 'unknown';
  resolved?: boolean;
  resolved_at?: string;
  resolved_by?: string;
}

export interface ErrorStats {
  total_errors: number;
  errors_by_category: Record<string, number>;
  errors_by_severity: Record<string, number>;
  recent_errors: SystemError[];
  error_rate: number; // errors per hour
}

export class ErrorMonitoringService {
  private static readonly ERROR_CATEGORIES = {
    validation: 'Data validation errors',
    network: 'Network and API errors', 
    database: 'Database operation errors',
    authentication: 'User authentication errors',
    business_logic: 'Application logic errors',
    unknown: 'Uncategorized errors'
  };

  private static readonly SEVERITY_LEVELS = {
    low: 'Minor issues, non-blocking',
    medium: 'Moderate issues, may affect functionality',
    high: 'Serious issues, significant impact',
    critical: 'Critical issues, system-breaking'
  };

  /**
   * Log an error with structured data
   */
  static async logError(
    context: string,
    error: Error | string,
    metadata?: Record<string, any>,
    severity: 'low' | 'medium' | 'high' | 'critical' = 'medium',
    category: 'validation' | 'network' | 'database' | 'authentication' | 'business_logic' | 'unknown' = 'unknown'
  ): Promise<void> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const errorMessage = typeof error === 'string' ? error : error.message;
      const errorStack = typeof error === 'string' ? undefined : error.stack;
      
      const systemError: Omit<SystemError, 'id'> = {
        context,
        error_message: errorMessage,
        error_stack: errorStack,
        metadata: metadata || {},
        user_id: user?.id || null,
        timestamp: new Date().toISOString(),
        severity,
        category,
        resolved: false
      };

      const { error: insertError } = await supabase
        .from('system_errors')
        .insert([systemError]);

      if (insertError) {
        console.error('Failed to log error to system_errors:', insertError);
        // Fallback to console logging
        console.error(`[${severity.toUpperCase()}] ${context}:`, errorMessage, metadata);
      } else {
        console.log(`✅ Error logged: ${context} (${severity})`);
      }
    } catch (logError) {
      console.error('Failed to log error to system_errors:', logError);
      // Fallback to console logging
      console.error(`[${severity.toUpperCase()}] ${context}:`, error, metadata);
    }
  }

  /**
   * Log validation errors
   */
  static async logValidationError(
    context: string,
    validationErrors: string[],
    data?: any
  ): Promise<void> {
    await this.logError(
      `validation_error: ${context}`,
      `Validation failed: ${validationErrors.join(', ')}`,
      { validation_errors: validationErrors, invalid_data: data },
      'medium',
      'validation'
    );
  }

  /**
   * Log network/API errors
   */
  static async logNetworkError(
    context: string,
    error: Error,
    url?: string,
    statusCode?: number
  ): Promise<void> {
    await this.logError(
      `network_error: ${context}`,
      error,
      { url, status_code: statusCode },
      'high',
      'network'
    );
  }

  /**
   * Log database errors
   */
  static async logDatabaseError(
    context: string,
    error: Error,
    query?: string,
    table?: string
  ): Promise<void> {
    await this.logError(
      `database_error: ${context}`,
      error,
      { query, table },
      'high',
      'database'
    );
  }

  /**
   * Log authentication errors
   */
  static async logAuthError(
    context: string,
    error: Error,
    userId?: string
  ): Promise<void> {
    await this.logError(
      `auth_error: ${context}`,
      error,
      { user_id: userId },
      'medium',
      'authentication'
    );
  }

  /**
   * Log business logic errors
   */
  static async logBusinessLogicError(
    context: string,
    error: Error,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.logError(
      `business_logic_error: ${context}`,
      error,
      metadata,
      'medium',
      'business_logic'
    );
  }

  /**
   * Get error statistics
   */
  static async getErrorStats(hours: number = 24): Promise<ErrorStats> {
    try {
      const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
      
      const { data: errors, error } = await supabase
        .from('system_errors')
        .select('*')
        .gte('timestamp', since)
        .order('timestamp', { ascending: false });

      if (error) {
        console.error('Failed to fetch error stats:', error);
        return {
          total_errors: 0,
          errors_by_category: {},
          errors_by_severity: {},
          recent_errors: [],
          error_rate: 0
        };
      }

      const totalErrors = errors?.length || 0;
      const errorRate = totalErrors / hours;

      // Group by category
      const errorsByCategory: Record<string, number> = {};
      const errorsBySeverity: Record<string, number> = {};

      errors?.forEach(error => {
        errorsByCategory[error.category] = (errorsByCategory[error.category] || 0) + 1;
        errorsBySeverity[error.severity] = (errorsBySeverity[error.severity] || 0) + 1;
      });

      return {
        total_errors: totalErrors,
        errors_by_category: errorsByCategory,
        errors_by_severity: errorsBySeverity,
        recent_errors: errors?.slice(0, 10) || [],
        error_rate: Math.round(errorRate * 100) / 100
      };
    } catch (error) {
      console.error('Error fetching error stats:', error);
      return {
        total_errors: 0,
        errors_by_category: {},
        errors_by_severity: {},
        recent_errors: [],
        error_rate: 0
      };
    }
  }

  /**
   * Get errors by category
   */
  static async getErrorsByCategory(
    category: string,
    limit: number = 50
  ): Promise<SystemError[]> {
    try {
      const { data: errors, error } = await supabase
        .from('system_errors')
        .select('*')
        .eq('category', category)
        .order('timestamp', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('Failed to fetch errors by category:', error);
        return [];
      }

      return errors || [];
    } catch (error) {
      console.error('Error fetching errors by category:', error);
      return [];
    }
  }

  /**
   * Get critical errors
   */
  static async getCriticalErrors(limit: number = 20): Promise<SystemError[]> {
    try {
      const { data: errors, error } = await supabase
        .from('system_errors')
        .select('*')
        .eq('severity', 'critical')
        .eq('resolved', false)
        .order('timestamp', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('Failed to fetch critical errors:', error);
        return [];
      }

      return errors || [];
    } catch (error) {
      console.error('Error fetching critical errors:', error);
      return [];
    }
  }

  /**
   * Mark error as resolved
   */
  static async resolveError(
    errorId: string,
    resolvedBy: string
  ): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('system_errors')
        .update({
          resolved: true,
          resolved_at: new Date().toISOString(),
          resolved_by: resolvedBy
        })
        .eq('id', errorId);

      if (error) {
        console.error('Failed to resolve error:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error resolving error:', error);
      return false;
    }
  }

  /**
   * Get error trends over time
   */
  static async getErrorTrends(days: number = 7): Promise<{
    date: string;
    error_count: number;
    critical_count: number;
  }[]> {
    try {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      
      const { data: errors, error } = await supabase
        .from('system_errors')
        .select('timestamp, severity')
        .gte('timestamp', since)
        .order('timestamp', { ascending: true });

      if (error) {
        console.error('Failed to fetch error trends:', error);
        return [];
      }

      // Group by date
      const trends: Record<string, { error_count: number; critical_count: number }> = {};
      
      errors?.forEach(error => {
        const date = new Date(error.timestamp).toISOString().split('T')[0];
        if (!trends[date]) {
          trends[date] = { error_count: 0, critical_count: 0 };
        }
        trends[date].error_count++;
        if (error.severity === 'critical') {
          trends[date].critical_count++;
        }
      });

      return Object.entries(trends).map(([date, counts]) => ({
        date,
        ...counts
      }));
    } catch (error) {
      console.error('Error fetching error trends:', error);
      return [];
    }
  }

  /**
   * Get error categories and their descriptions
   */
  static getErrorCategories(): Record<string, string> {
    return this.ERROR_CATEGORIES;
  }

  /**
   * Get severity levels and their descriptions
   */
  static getSeverityLevels(): Record<string, string> {
    return this.SEVERITY_LEVELS;
  }
}

// Export convenience functions
export const logError = ErrorMonitoringService.logError.bind(ErrorMonitoringService);
export const logValidationError = ErrorMonitoringService.logValidationError.bind(ErrorMonitoringService);
export const logNetworkError = ErrorMonitoringService.logNetworkError.bind(ErrorMonitoringService);
export const logDatabaseError = ErrorMonitoringService.logDatabaseError.bind(ErrorMonitoringService);
export const logAuthError = ErrorMonitoringService.logAuthError.bind(ErrorMonitoringService);
export const logBusinessLogicError = ErrorMonitoringService.logBusinessLogicError.bind(ErrorMonitoringService);
