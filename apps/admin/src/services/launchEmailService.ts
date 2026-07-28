import { supabase } from '@/integrations/supabase/client';

export interface LaunchEmailEntry {
  id: string;
  email: string;
  ip_address: string;
  user_agent?: string;
  created_at: string;
  updated_at: string;
}

export class LaunchEmailService {
  /**
   * Get user's IP address from external service
   */
  static async getUserIP(): Promise<string> {
    try {
      // Try multiple IP services for reliability
      const response = await fetch('https://api.ipify.org?format=json');
      const data = await response.json();
      return data.ip;
    } catch (error) {
      console.error('Error fetching IP:', error);
      // Fallback to a different service
      try {
        const response = await fetch('https://api.ip.sb/ip');
        const ip = await response.text();
        return ip.trim();
      } catch (fallbackError) {
        console.error('Error with fallback IP service:', fallbackError);
        return 'unknown';
      }
    }
  }

  /**
   * Validate email format
   */
  static validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
  }

  /**
   * Submit email for launch signup
   */
  static async submitEmail(email: string): Promise<{
    success: boolean;
    message: string;
    error?: string;
  }> {
    try {
      // Validate email format
      if (!this.validateEmail(email)) {
        return {
          success: false,
          message: 'Please enter a valid email address.',
          error: 'invalid_email'
        };
      }

      const ipAddress = await this.getUserIP();
      const userAgent = navigator.userAgent;

      // Try to insert the email
      const { error } = await supabase
        .from('email_gate_entries')
        .insert({
          email: email.toLowerCase().trim(),
          ip_address: ipAddress,
          user_agent: userAgent
        });

      if (error) {
        // Check if it's a duplicate IP error
        if (error.code === '23505') {
          // IP already exists, update the email instead
          const { error: updateError } = await supabase
            .from('email_gate_entries')
            .update({
              email: email.toLowerCase().trim(),
              user_agent: userAgent
            })
            .eq('ip_address', ipAddress);

          if (updateError) {
            console.error('Error updating email:', updateError);
            return {
              success: false,
              message: 'Something went wrong. Please try again.',
              error: 'update_failed'
            };
          }
          return {
            success: true,
            message: "Thanks! We'll be in touch soon."
          };
        }

        // Check if it's a duplicate email error
        if (error.message.includes('duplicate key') || error.message.includes('unique')) {
          return {
            success: true,
            message: "Thanks! We already have your email. We'll be in touch soon."
          };
        }

        console.error('Error submitting email:', error);
        return {
          success: false,
          message: 'Something went wrong. Please try again.',
          error: 'submission_failed'
        };
      }

      return {
        success: true,
        message: "Thanks! We'll be in touch soon."
      };
    } catch (error) {
      console.error('Error submitting email:', error);
      return {
        success: false,
        message: 'Something went wrong. Please try again.',
        error: 'network_error'
      };
    }
  }

  /**
   * Get all email signups (for analytics - requires authentication)
   */
  static async getAllSignups(limit: number = 100, offset: number = 0): Promise<{
    entries: LaunchEmailEntry[];
    total: number;
  }> {
    try {
      const { data, error, count } = await supabase
        .from('email_gate_entries')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        console.error('Error fetching signups:', error);
        return { entries: [], total: 0 };
      }

      return {
        entries: (data as LaunchEmailEntry[]) || [],
        total: count || 0
      };
    } catch (error) {
      console.error('Error fetching signups:', error);
      return { entries: [], total: 0 };
    }
  }
}
