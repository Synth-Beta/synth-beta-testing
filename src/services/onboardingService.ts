import { supabase } from '@/integrations/supabase/client';

export interface OnboardingStatus {
  onboarding_completed: boolean;
  onboarding_skipped: boolean;
  tour_completed: boolean;
}

export interface ProfileSetupData {
  location_city?: string;
  birthday?: string;
  gender?: string;
  bio?: string;
  avatar_url?: string;
}

export class OnboardingService {
  /**
   * Check the onboarding status for a user
   */
  static async checkOnboardingStatus(userId: string): Promise<OnboardingStatus | null> {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('onboarding_completed, onboarding_skipped, tour_completed')
        .eq('user_id', userId)
        .single();

      if (error) throw error;

      return data;
    } catch (error) {
      console.error('Error checking onboarding status:', error);
      return null;
    }
  }

  /**
   * Save profile setup data (Step 1)
   */
  static async saveProfileSetup(userId: string, data: ProfileSetupData): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          location_city: data.location_city,
          birthday: data.birthday,
          gender: data.gender,
          bio: data.bio,
          avatar_url: data.avatar_url,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);

      if (error) throw error;

      return true;
    } catch (error) {
      console.error('Error saving profile setup:', error);
      return false;
    }
  }

  /**
   * Create an account upgrade request (Step 2)
   */
  static async requestAccountUpgrade(
    userId: string,
    accountType: 'creator' | 'business',
    businessInfo: Record<string, any>
  ): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('account_upgrade_requests')
        .insert({
          user_id: userId,
          requested_account_type: accountType,
          business_info: businessInfo,
          status: 'pending',
        });

      if (error) throw error;

      return true;
    } catch (error) {
      console.error('Error requesting account upgrade:', error);
      return false;
    }
  }

  /**
   * Mark onboarding as skipped
   */
  static async skipOnboarding(userId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          onboarding_skipped: true,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);

      if (error) throw error;

      return true;
    } catch (error) {
      console.error('Error skipping onboarding:', error);
      return false;
    }
  }

  /**
   * Mark onboarding as completed
   */
  static async completeOnboarding(userId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          onboarding_completed: true,
          onboarding_skipped: false,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);

      if (error) throw error;

      return true;
    } catch (error) {
      console.error('Error completing onboarding:', error);
      return false;
    }
  }

  /**
   * Mark tour as completed
   */
  static async completeTour(userId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          tour_completed: true,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);

      if (error) throw error;

      return true;
    } catch (error) {
      console.error('Error completing tour:', error);
      return false;
    }
  }

  /**
   * Check if user has pending account upgrade request
   */
  static async hasPendingUpgradeRequest(userId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('account_upgrade_requests')
        .select('id, status')
        .eq('user_id', userId)
        .eq('status', 'pending')
        .maybeSingle();

      if (error) throw error;

      return data !== null;
    } catch (error) {
      console.error('Error checking pending upgrade request:', error);
      return false;
    }
  }
}

