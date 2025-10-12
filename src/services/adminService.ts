/**
 * Admin Service
 * Handles all admin operations: claim review, user management, moderation
 */

import { supabase } from '@/integrations/supabase/client';

export interface PendingTask {
  task_type: string;
  task_count: number;
  oldest_task_date: string;
}

export interface AdminAction {
  id: string;
  admin_user_id: string;
  action_type: string;
  target_type: string;
  target_id: string;
  action_details: any;
  reason?: string;
  created_at: string;
}

export interface ModerationFlag {
  id: string;
  flagged_by_user_id: string;
  content_type: string;
  content_id: string;
  flag_reason: string;
  flag_details?: string;
  flag_status: string;
  reviewed_by_admin_id?: string;
  reviewed_at?: string;
  review_notes?: string;
  action_taken?: string;
  created_at: string;
  updated_at: string;
}

export class AdminService {
  /**
   * Get counts of pending admin tasks
   */
  static async getPendingTasks(): Promise<PendingTask[]> {
    try {
      const { data, error } = await (supabase as any).rpc('get_pending_admin_tasks');

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching pending tasks:', error);
      throw error;
    }
  }

  /**
   * Get all pending event claims for review
   */
  static async getPendingClaims(): Promise<any[]> {
    try {
      const { data: claims, error } = await (supabase as any)
        .from('event_claims')
        .select(`
          *,
          event:jambase_events(
            id,
            title,
            artist_name,
            venue_name,
            event_date,
            poster_image_url
          )
        `)
        .eq('claim_status', 'pending')
        .order('created_at', { ascending: true });

      if (error) throw error;
      
      // Fetch claimer profiles separately
      if (claims && claims.length > 0) {
        const userIds = claims.map((c: any) => c.claimed_by_user_id);
        const { data: profiles } = await (supabase as any)
          .from('profiles')
          .select('user_id, name, avatar_url, account_type')
          .in('user_id', userIds);
        
        // Merge profiles into claims
        return claims.map((claim: any) => ({
          ...claim,
          claimer: profiles?.find(p => p.user_id === claim.claimed_by_user_id)
        }));
      }
      
      return claims || [];
    } catch (error) {
      console.error('Error fetching pending claims:', error);
      throw error;
    }
  }

  /**
   * Get all event claims (for admin view)
   */
  static async getAllClaims(status?: string): Promise<any[]> {
    try {
      let query = (supabase as any)
        .from('event_claims')
        .select(`
          *,
          event:jambase_events(
            id,
            title,
            artist_name,
            venue_name,
            event_date
          )
        `)
        .order('created_at', { ascending: false });

      if (status) {
        query = query.eq('claim_status', status);
      }

      const { data: claims, error } = await query;

      if (error) throw error;
      
      // Fetch user profiles separately
      if (claims && claims.length > 0) {
        const userIds = [...new Set([
          ...claims.map((c: any) => c.claimed_by_user_id),
          ...claims.filter((c: any) => c.reviewed_by_admin_id).map((c: any) => c.reviewed_by_admin_id)
        ])];
        
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, name, avatar_url')
          .in('user_id', userIds);
        
        // Merge profiles into claims
        return claims.map((claim: any) => ({
          ...claim,
          claimer: profiles?.find(p => p.user_id === claim.claimed_by_user_id),
          reviewer: claim.reviewed_by_admin_id 
            ? profiles?.find(p => p.user_id === claim.reviewed_by_admin_id)
            : null
        }));
      }

      return claims || [];
    } catch (error) {
      console.error('Error fetching all claims:', error);
      throw error;
    }
  }

  /**
   * Get admin action history
   */
  static async getAdminActions(limit = 50): Promise<AdminAction[]> {
    try {
      const { data, error } = await (supabase as any)
        .from('admin_actions')
        .select(`
          *,
          admin:profiles!admin_actions_admin_user_id_fkey(
            user_id,
            name,
            avatar_url
          )
        `)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching admin actions:', error);
      throw error;
    }
  }

  /**
   * Get pending moderation flags
   */
  static async getPendingFlags(): Promise<any[]> {
    try {
      console.log('🔍 AdminService: Fetching pending flags...');
      const user = await supabase.auth.getUser();
      console.log('🔍 AdminService: Current user ID:', user.data.user?.id);
      console.log('🔍 AdminService: User session:', !!user.data.user);
      
      // First try using the dedicated function (with proper typing)
      try {
        const { data: flags, error } = await (supabase as any).rpc('get_pending_moderation_flags');
        
        if (!error && flags && Array.isArray(flags)) {
          console.log('🔍 AdminService: Flags from function:', flags);
          console.log('🔍 AdminService: Flags count from function:', flags.length);
          return flags;
        } else {
          console.log('⚠️ AdminService: Function failed, trying simple function:', error);
        }
      } catch (functionError) {
        console.log('⚠️ AdminService: Function not available, trying simple function:', functionError);
      }
      
      // Try the simple function as fallback
      try {
        const { data: flags, error } = await (supabase as any).rpc('get_pending_flags_simple');
        
        if (!error && flags && Array.isArray(flags)) {
          console.log('🔍 AdminService: Flags from simple function:', flags);
          console.log('🔍 AdminService: Flags count from simple function:', flags.length);
          return flags;
        } else {
          console.log('⚠️ AdminService: Simple function failed, falling back to direct query:', error);
        }
      } catch (functionError) {
        console.log('⚠️ AdminService: Simple function not available, using direct query:', functionError);
      }
      
      // Fallback to direct query
      const { data: flags, error } = await (supabase as any)
        .from('moderation_flags')
        .select('*')
        .eq('flag_status', 'pending')
        .order('created_at', { ascending: true });

      if (error) {
        console.error('❌ AdminService: Error fetching flags:', error);
        console.error('❌ AdminService: Error details:', JSON.stringify(error, null, 2));
        throw error;
      }

      console.log('🔍 AdminService: Raw flags from DB:', flags);
      console.log('🔍 AdminService: Flags count:', flags?.length || 0);
      
      // Fetch flagger profiles separately
      if (flags && flags.length > 0) {
        const userIds = flags.map((f: any) => f.flagged_by_user_id);
        console.log('🔍 AdminService: Fetching profiles for user IDs:', userIds);
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, name, avatar_url')
          .in('user_id', userIds);
        
        console.log('🔍 AdminService: Profiles fetched:', profiles);
        
        // Merge profiles into flags
        const mergedFlags = flags.map((flag: any) => ({
          ...flag,
          flagger: profiles?.find(p => p.user_id === flag.flagged_by_user_id)
        }));
        
        console.log('🔍 AdminService: Merged flags:', mergedFlags);
        return mergedFlags;
      }
      
      console.log('🔍 AdminService: No flags found, returning empty array');
      return flags || [];
    } catch (error) {
      console.error('❌ AdminService: Error fetching pending flags:', error);
      throw error;
    }
  }

  /**
   * Get all moderation flags
   */
  static async getAllFlags(status?: string): Promise<any[]> {
    try {
      let query = (supabase as any)
        .from('moderation_flags')
        .select('*')
        .order('created_at', { ascending: false });

      if (status) {
        query = query.eq('flag_status', status);
      }

      const { data: flags, error } = await query;

      if (error) throw error;
      
      // Fetch user profiles separately
      if (flags && flags.length > 0) {
        const userIds = [...new Set([
          ...flags.map((f: any) => f.flagged_by_user_id),
          ...flags.filter((f: any) => f.reviewed_by_admin_id).map((f: any) => f.reviewed_by_admin_id)
        ])];
        
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, name, avatar_url')
          .in('user_id', userIds);
        
        // Merge profiles into flags
        return flags.map((flag: any) => ({
          ...flag,
          flagger: profiles?.find(p => p.user_id === flag.flagged_by_user_id),
          reviewer: flag.reviewed_by_admin_id 
            ? profiles?.find(p => p.user_id === flag.reviewed_by_admin_id)
            : null
        }));
      }

      return flags || [];
    } catch (error) {
      console.error('Error fetching flags:', error);
      throw error;
    }
  }

  /**
   * Review moderation flag
   */
  static async reviewFlag(
    flagId: string,
    status: 'resolved' | 'dismissed',
    reviewNotes?: string,
    actionTaken?: string
  ): Promise<void> {
    try {
      const { error } = await (supabase as any)
        .from('moderation_flags')
        .update({
          flag_status: status,
          reviewed_by_admin_id: (await supabase.auth.getUser()).data.user?.id,
          reviewed_at: new Date().toISOString(),
          review_notes: reviewNotes,
          action_taken: actionTaken,
          updated_at: new Date().toISOString(),
        })
        .eq('id', flagId);

      if (error) throw error;
    } catch (error) {
      console.error('Error reviewing flag:', error);
      throw error;
    }
  }

  /**
   * Delete event (admin)
   */
  static async deleteEvent(eventId: string, reason: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('jambase_events')
        .delete()
        .eq('id', eventId);

      if (error) throw error;

      // Log action
      await this.logAction({
        action_type: 'event_deleted',
        target_type: 'event',
        target_id: eventId,
        reason,
      });
    } catch (error) {
      console.error('Error deleting event:', error);
      throw error;
    }
  }

  /**
   * Change user account type
   */
  static async changeAccountType(
    userId: string,
    accountType: 'user' | 'creator' | 'business' | 'admin',
    subscriptionTier?: string,
    verificationLevel?: string
  ): Promise<void> {
    try {
      const { error } = await (supabase as any).rpc('admin_set_account_type', {
        p_user_id: userId,
        p_account_type: accountType,
        p_verification_level: verificationLevel || 'email',
        p_subscription_tier: subscriptionTier || 'free',
      });

      if (error) throw error;

      // Log action
      await this.logAction({
        action_type: 'account_type_changed',
        target_type: 'user',
        target_id: userId,
        action_details: {
          new_account_type: accountType,
          subscription_tier: subscriptionTier,
          verification_level: verificationLevel,
        },
      });
    } catch (error) {
      console.error('Error changing account type:', error);
      throw error;
    }
  }

  /**
   * Ban/unban user
   */
  static async toggleUserBan(
    userId: string,
    banned: boolean,
    reason?: string
  ): Promise<void> {
    try {
      // TODO: Implement user ban in profiles table
      // For now, just log the action
      await this.logAction({
        action_type: banned ? 'user_banned' : 'user_unbanned',
        target_type: 'user',
        target_id: userId,
        reason,
      });
    } catch (error) {
      console.error('Error toggling user ban:', error);
      throw error;
    }
  }

  /**
   * Get all users (for admin management)
   */
  static async getAllUsers(
    accountType?: string,
    limit = 50,
    offset = 0
  ): Promise<any[]> {
    try {
      let query: any = (supabase as any)
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (accountType) {
        query = query.eq('account_type', accountType);
      }

      const { data, error } = await query;


      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching users:', error);
      throw error;
    }
  }

  /**
   * Search users
   */
  static async searchUsers(searchTerm: string): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .or(`name.ilike.%${searchTerm}%,bio.ilike.%${searchTerm}%`)
        .limit(20);

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error searching users:', error);
      throw error;
    }
  }

  /**
   * Get platform statistics
   */
  static async getPlatformStats(): Promise<any> {
    try {
      // Get various counts
      const [usersCount, eventsCount, claimsCount, flagsCount, promotionsCount] =
        await Promise.all([
          supabase.from('profiles').select('*', { count: 'exact', head: true }),
          supabase.from('jambase_events').select('*', { count: 'exact', head: true }),
          (supabase as any).from('event_claims').select('*', { count: 'exact', head: true }),
          (supabase as any)
            .from('moderation_flags')
            .select('*', { count: 'exact', head: true }),
          (supabase as any)
            .from('event_promotions')
            .select('*', { count: 'exact', head: true }),
        ]);

      return {
        total_users: usersCount.count || 0,
        total_events: eventsCount.count || 0,
        total_claims: claimsCount.count || 0,
        total_flags: flagsCount.count || 0,
        total_promotions: promotionsCount.count || 0,
      };
    } catch (error) {
      console.error('Error fetching platform stats:', error);
      throw error;
    }
  }

  /**
   * Log admin action (private helper)
   */
  private static async logAction(action: {
    action_type: string;
    target_type: string;
    target_id: string;
    action_details?: any;
    reason?: string;
  }): Promise<void> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await (supabase as any).from('admin_actions').insert({
        admin_user_id: user.id,
        ...action,
      } as any);
    } catch (error) {
      console.error('Error logging admin action:', error);
      // Don't throw - logging failure shouldn't break the main action
    }
  }
}

export default AdminService;

