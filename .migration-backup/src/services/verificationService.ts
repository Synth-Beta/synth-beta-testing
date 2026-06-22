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
      // Get user data (for account_type check)
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('account_type')
        .eq('user_id', userId)
        .single();

      if (userError || !user) {
        throw new Error('User not found');
      }

      // Get existing verification data
      const { data: verification, error: verificationError } = await supabase
        .from('user_verifications')
        .select('*')
        .eq('user_id', userId)
        .single();

      // For admin, creator, and business accounts, verification is handled by the database trigger
      if (user.account_type !== 'user') {
        // Ensure verification record exists for non-user accounts
        if (verificationError || !verification) {
          await supabase
            .from('user_verifications')
            .upsert({
              user_id: userId,
              verified: true,
              verification_level: 'premium',
              trust_score: 100,
            });
        }
        return {
          verified: verification?.verified || true,
          trustScore: verification?.trust_score || 100,
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
        .from('user_relationships')
        .select('*', { count: 'exact', head: true })
        .eq('relationship_type', 'friend')
        .eq('status', 'accepted')
        .or(`user_id.eq.${userId},related_user_id.eq.${userId}`);

      // Get event interest count
      const { count: eventCount } = await supabase
        .from('user_event_relationships')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .in('relationship_type', ['interested', 'going', 'maybe']);

      // Get attended event count (events with reviews)
      const { count: attendedCount } = await supabase
        .from('reviews')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('was_there', true);

      // Get full profile data for trust score calculation (using compatibility view)
      const { data: profile, error: profileError } = await supabase
        .from('users_complete')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (profileError || !profile) {
        console.error('Error fetching profile for trust score calculation:', profileError);
        throw new Error('Profile not found for trust score calculation');
      }

      // Calculate trust score
      const trustScoreBreakdown = calculateUserTrustScore(
        profile as any, // Type cast for compatibility
        reviewCount || 0,
        friendCount || 0,
        eventCount || 0,
        attendedCount || 0
      );

      // Update user_verifications table with new trust score and verification status
      const { error: updateError } = await supabase
        .from('user_verifications')
        .upsert({
          user_id: userId,
          trust_score: trustScoreBreakdown.score,
          verification_criteria_met: trustScoreBreakdown.criteria,
          verified: trustScoreBreakdown.isVerified,
          verified_at: trustScoreBreakdown.isVerified && !verification?.verified_at ? new Date().toISOString() : verification?.verified_at,
        });

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
      // Get profile data using compatibility view
      const { data: profile, error: profileError } = await supabase
        .from('users_complete')
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
        .from('user_relationships')
        .select('*', { count: 'exact', head: true })
        .eq('relationship_type', 'friend')
        .eq('status', 'accepted')
        .or(`user_id.eq.${userId},related_user_id.eq.${userId}`);

      // Get event interest count
      const { count: eventCount } = await supabase
        .from('user_event_relationships')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .in('relationship_type', ['interested', 'going', 'maybe']);

      // Get attended event count
      const { count: attendedCount } = await supabase
        .from('reviews')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('was_there', true);

      const breakdown = calculateUserTrustScore(
        profile as any, // Type cast for compatibility
        reviewCount || 0,
        friendCount || 0,
        eventCount || 0,
        attendedCount || 0
      );

      // Include profile data and friend count for display purposes
      return {
        ...breakdown,
        profile: profile as any,
        friendCount: friendCount || 0,
      };
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

      // Update the target user's verification status in user_verifications table
      const { error } = await supabase
        .from('user_verifications')
        .upsert({
          user_id: targetUserId,
          verified,
          verified_by: verified ? adminUserId : null,
          verified_at: verified ? new Date().toISOString() : null,
        });

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
      // Query users with verification data joined
      const { data, error } = await supabase
        .from('users')
        .select(`
          *,
          user_verifications!inner (
            verified,
            trust_score,
            verification_level
          )
        `)
        .eq('account_type', 'user')
        .eq('user_verifications.verified', false)
        .gte('user_verifications.trust_score', 40)
        .order('user_verifications.trust_score', { ascending: false })
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

