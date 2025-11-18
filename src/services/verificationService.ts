import { supabase } from '@/integrations/supabase/client';
import { calculateUserTrustScore, TrustScoreBreakdown, Profile } from '@/utils/verificationUtils';

export class VerificationService {
  /**
   * Check and update verification status for a user
   */
  static async checkVerificationStatus(userId: string): Promise<{
    verified: boolean;
    trustScore: number;
    criteriaMet: number;
  }> {
    try {
      // Get profile data
      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (profileError || !profile) {
        throw new Error('Profile not found');
      }

      // For admin, creator, and business accounts, verification is handled by the database trigger
      if (profile.account_type !== 'user') {
        return {
          verified: profile.verified || false,
          trustScore: 100,
          criteriaMet: 8,
        };
      }

      // Get review count
      const { count: reviewCount } = await supabase
        .from('reviews')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      // Get friend count
      const { count: friendCount } = await supabase
        .from('relationships')
        .select('*', { count: 'exact', head: true })
        .eq('related_entity_type', 'user')
        .eq('relationship_type', 'friend')
        .eq('status', 'accepted')
        .or(`user_id.eq.${userId},related_entity_id.eq.${userId}`);

      // Get event interest count
      const { count: eventCount } = await supabase
        .from('relationships')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('related_entity_type', 'event')
        .in('relationship_type', ['interest', 'going', 'maybe']);

      // Get attended event count (events with reviews)
      const { count: attendedCount } = await supabase
        .from('reviews')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('was_there', true);

      // Calculate trust score
      const trustScoreBreakdown = calculateUserTrustScore(
        profile,
        reviewCount || 0,
        friendCount || 0,
        eventCount || 0,
        attendedCount || 0
      );

      // Update profile with new trust score and verification status
      const { error: updateError } = await supabase
        .from('users')
        .update({
          trust_score: trustScoreBreakdown.score,
          verification_criteria_met: trustScoreBreakdown.criteria,
          verified: trustScoreBreakdown.isVerified,
          verified_at: trustScoreBreakdown.isVerified && !profile.verified_at ? new Date().toISOString() : profile.verified_at,
        })
        .eq('user_id', userId);

      if (updateError) {
        console.error('Error updating verification status:', updateError);
      }

      return {
        verified: trustScoreBreakdown.isVerified,
        trustScore: trustScoreBreakdown.score,
        criteriaMet: trustScoreBreakdown.criteriaMet,
      };
    } catch (error) {
      console.error('Error checking verification status:', error);
      throw error;
    }
  }

  /**
   * Get detailed trust score breakdown for a user
   */
  static async getTrustScoreBreakdown(userId: string): Promise<TrustScoreBreakdown> {
    try {
      // Get profile data
      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (profileError || !profile) {
        throw new Error('Profile not found');
      }

      // Get review count
      const { count: reviewCount } = await supabase
        .from('reviews')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      // Get friend count
      const { count: friendCount } = await supabase
        .from('relationships')
        .select('*', { count: 'exact', head: true })
        .eq('related_entity_type', 'user')
        .eq('relationship_type', 'friend')
        .eq('status', 'accepted')
        .or(`user_id.eq.${userId},related_entity_id.eq.${userId}`);

      // Get event interest count
      const { count: eventCount } = await supabase
        .from('relationships')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('related_entity_type', 'event')
        .in('relationship_type', ['interest', 'going', 'maybe']);

      // Get attended event count
      const { count: attendedCount } = await supabase
        .from('reviews')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('was_there', true);

      return calculateUserTrustScore(
        profile,
        reviewCount || 0,
        friendCount || 0,
        eventCount || 0,
        attendedCount || 0
      );
    } catch (error) {
      console.error('Error getting trust score breakdown:', error);
      throw error;
    }
  }

  /**
   * Force recalculation of verification status
   */
  static async refreshVerificationStatus(userId: string): Promise<void> {
    await this.checkVerificationStatus(userId);
  }

  /**
   * Admin function to manually verify a user
   */
  static async manuallyVerifyUser(
    targetUserId: string,
    adminUserId: string,
    verified: boolean
  ): Promise<void> {
    try {
      // Check if the requesting user is an admin
      const { data: adminProfile } = await supabase
        .from('users')
        .select('account_type')
        .eq('user_id', adminUserId)
        .single();

      if (adminProfile?.account_type !== 'admin') {
        throw new Error('Only admins can manually verify users');
      }

      // Update the target user's verification status
      const { error } = await supabase
        .from('users')
        .update({
          verified,
          verified_by: verified ? adminUserId : null,
          verified_at: verified ? new Date().toISOString() : null,
        })
        .eq('user_id', targetUserId);

      if (error) {
        throw error;
      }
    } catch (error) {
      console.error('Error manually verifying user:', error);
      throw error;
    }
  }

  /**
   * Get users close to verification threshold (for admin review)
   */
  static async getUsersNearVerification(limit: number = 50): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('account_type', 'user')
        .eq('verified', false)
        .gte('trust_score', 40)
        .order('trust_score', { ascending: false })
        .limit(limit);

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error getting users near verification:', error);
      throw error;
    }
  }
}

