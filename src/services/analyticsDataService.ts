/**
 * Analytics Data Service
 * 
 * This service provides access to complete user data for analytics purposes,
 * bypassing RLS restrictions that only show public profiles.
 */

import { supabase } from '@/integrations/supabase/client';

export interface AnalyticsProfile {
  user_id: string;
  name: string;
  avatar_url: string | null;
  account_type: string;
  business_info: any;
  created_at: string;
  updated_at: string;
  last_active_at: string;
  is_public_profile: boolean;
  subscription_tier?: string;
}

export class AnalyticsDataService {
  /**
   * Get all profiles for analytics purposes
   * This bypasses RLS restrictions to get complete user data
   */
  static async getAllProfiles(): Promise<AnalyticsProfile[]> {
    try {
      // Use the RPC function to get all profiles for analytics
      const { data, error } = await supabase
        .rpc('get_all_profiles_for_analytics' as any);

      if (error) {
        console.error('Error getting all profiles for analytics:', error);
        throw error;
      }

      return (data || []) as AnalyticsProfile[];
    } catch (error) {
      console.error('Error in getAllProfiles:', error);
      throw error;
    }
  }

  /**
   * Get profiles by account type for analytics
   */
  static async getProfilesByAccountType(accountType: string): Promise<AnalyticsProfile[]> {
    try {
      const allProfiles = await this.getAllProfiles();
      return allProfiles.filter(profile => profile.account_type === accountType);
    } catch (error) {
      console.error('Error getting profiles by account type:', error);
      throw error;
    }
  }

  /**
   * Get user interactions for analytics (all users)
   */
  static async getAllUserInteractions(
    eventIds?: string[],
    eventTypes?: string[],
    entityTypes?: string[]
  ): Promise<any[]> {
    try {
      let query = supabase
        .from('interactions')
        .select('*');

      if (eventIds && eventIds.length > 0) {
        query = query.in('entity_id', eventIds);
      }

      if (eventTypes && eventTypes.length > 0) {
        query = query.in('event_type', eventTypes);
      }

      if (entityTypes && entityTypes.length > 0) {
        query = query.in('entity_type', entityTypes);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error getting user interactions for analytics:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error in getAllUserInteractions:', error);
      throw error;
    }
  }

  /**
   * Get all user reviews for analytics (including private ones)
   */
  static async getAllUserReviews(eventIds?: string[]): Promise<any[]> {
    try {
      let query = supabase
        .from('reviews')
        .select('*')
        .eq('is_draft', false)
        .neq('review_text', 'ATTENDANCE_ONLY');

      if (eventIds && eventIds.length > 0) {
        query = query.in('event_id', eventIds);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error getting user reviews for analytics:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error in getAllUserReviews:', error);
      throw error;
    }
  }

  /**
   * Get all interested users for analytics
   */
  static async getAllInterestedUsers(eventIds?: string[]): Promise<any[]> {
    try {
      let query = supabase
        .from('user_event_relationships')
        .select('*')
        .in('relationship_type', ['interested', 'going', 'maybe']);

      if (eventIds && eventIds.length > 0) {
        query = query.in('event_id', eventIds);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error getting interested users for analytics:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error in getAllInterestedUsers:', error);
      throw error;
    }
  }

  /**
   * Get all friends relationships for analytics
   */
  static async getAllFriendships(): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('user_relationships')
        .select('*')
        .eq('relationship_type', 'friend')
        .eq('status', 'accepted');

      if (error) {
        console.error('Error getting friendships for analytics:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error in getAllFriendships:', error);
      throw error;
    }
  }

  /**
   * Get user profile by ID for analytics
   */
  static async getProfileById(userId: string): Promise<AnalyticsProfile | null> {
    try {
      const allProfiles = await this.getAllProfiles();
      return allProfiles.find(profile => profile.user_id === userId) || null;
    } catch (error) {
      console.error('Error getting profile by ID:', error);
      throw error;
    }
  }

  /**
   * Get profiles by business info for analytics
   */
  static async getProfilesByBusinessInfo(businessInfo: any): Promise<AnalyticsProfile[]> {
    try {
      const allProfiles = await this.getAllProfiles();
      return allProfiles.filter(profile => {
        if (!profile.business_info) return false;
        
        // Check if business info matches
        for (const [key, value] of Object.entries(businessInfo)) {
          if (profile.business_info[key] !== value) {
            return false;
          }
        }
        
        return true;
      });
    } catch (error) {
      console.error('Error getting profiles by business info:', error);
      throw error;
    }
  }
}
