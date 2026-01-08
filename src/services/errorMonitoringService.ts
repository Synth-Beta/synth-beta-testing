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
   * DISABLED: system_errors table doesn't exist
   */
  static async logError(
    context: string,
    error: Error | string,
    metadata?: Record<string, any>,
    severity: 'low' | 'medium' | 'high' | 'critical' = 'medium',
    category: 'validation' | 'network' | 'database' | 'authentication' | 'business_logic' | 'unknown' = 'unknown'
  ): Promise<void> {
    // DISABLED: system_errors table doesn't exist - just log to console
    const errorMessage = typeof error === 'string' ? error : error.message;
    console.error(`[${severity.toUpperCase()}] ${context}:`, errorMessage, metadata);
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
   * DISABLED: system_errors table doesn't exist
   */
  static async getErrorStats(hours: number = 24): Promise<ErrorStats> {
    // DISABLED: system_errors table doesn't exist
    return {
      total_errors: 0,
      errors_by_category: {},
      errors_by_severity: {},
      recent_errors: [],
      error_rate: 0
    };
  }

  /**
   * Get errors by category
   * DISABLED: system_errors table doesn't exist
   */
  static async getErrorsByCategory(
    category: string,
    limit: number = 50
  ): Promise<SystemError[]> {
    // DISABLED: system_errors table doesn't exist
    return [];
  }

  /**
   * Get critical errors
   * DISABLED: system_errors table doesn't exist
   */
  static async getCriticalErrors(limit: number = 20): Promise<SystemError[]> {
    // DISABLED: system_errors table doesn't exist
    return [];
  }

  /**
   * Mark error as resolved
   * DISABLED: system_errors table doesn't exist
   */
  static async resolveError(
    errorId: string,
    resolvedBy: string
  ): Promise<boolean> {
    // DISABLED: system_errors table doesn't exist
    return false;
  }

  /**
   * Get error trends over time
   * DISABLED: system_errors table doesn't exist
   */
  static async getErrorTrends(days: number = 7): Promise<{
    date: string;
    error_count: number;
    critical_count: number;
  }[]> {
    // DISABLED: system_errors table doesn't exist
    return [];
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
