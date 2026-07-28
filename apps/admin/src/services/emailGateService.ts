import { supabase } from '@/integrations/supabase/client';

export interface EmailGateEntry {
  id: string;
  email: string;
  ip_address: string;
  user_agent?: string;
  created_at: string;
  updated_at: string;
}

export class EmailGateService {
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
   * Check if IP address has already submitted email
   */
  static async checkIPExists(ipAddress: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('Waitlist')
        .select('id')
        .eq('ip_address', ipAddress)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('Error checking IP:', error);
        return false;
      }

      return !!data;
    } catch (error) {
      console.error('Error checking IP existence:', error);
      return false;
    }
  }

  /**
   * Submit email for IP address
   */
  static async submitEmail(email: string, ipAddress: string): Promise<boolean> {
    try {
      const userAgent = navigator.userAgent;

      const { error } = await supabase
        .from('Waitlist')
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
            .from('Waitlist')
            .update({
              email: email.toLowerCase().trim(),
              user_agent: userAgent
            })
            .eq('ip_address', ipAddress);

          if (updateError) {
            console.error('Error updating email:', updateError);
            return false;
          }
          return true;
        }

        console.error('Error submitting email:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error submitting email:', error);
      return false;
    }
  }

  /**
   * Get entry by IP address
   */
  static async getEntryByIP(ipAddress: string): Promise<EmailGateEntry | null> {
    try {
      const { data, error } = await supabase
        .from('Waitlist')
        .select('*')
        .eq('ip_address', ipAddress)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching entry:', error);
        return null;
      }

      return data as EmailGateEntry;
    } catch (error) {
      console.error('Error fetching entry:', error);
      return null;
    }
  }

  /**
   * Get all entries (for analytics - requires authentication)
   */
  static async getAllEntries(limit: number = 100, offset: number = 0): Promise<{
    entries: EmailGateEntry[];
    total: number;
  }> {
    try {
      const { data, error, count } = await supabase
        .from('Waitlist')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        console.error('Error fetching entries:', error);
        return { entries: [], total: 0 };
      }

      return {
        entries: (data as EmailGateEntry[]) || [],
        total: count || 0
      };
    } catch (error) {
      console.error('Error fetching entries:', error);
      return { entries: [], total: 0 };
    }
  }
}

