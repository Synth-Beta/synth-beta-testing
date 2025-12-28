import { supabase } from '@/integrations/supabase/client';

export interface OnboardingStatus {
  onboarding_completed: boolean;
  onboarding_skipped: boolean;
  tour_completed: boolean;
}

export interface ProfileSetupData {
  username?: string;
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
      // Try to get onboarding fields, but handle gracefully if they don't exist
      const { data, error } = await supabase
        .from('users')
        .select('onboarding_completed, onboarding_skipped, tour_completed')
        .eq('user_id', userId)
        .single();

      if (error) {
        // If columns don't exist, return default values
        if (error.code === '42703' || error.message?.includes('does not exist')) {
          console.warn('Onboarding columns not found in users table, returning defaults');
          return {
            onboarding_completed: false,
            onboarding_skipped: false,
            tour_completed: false,
          };
        }
        throw error;
      }

      // If data exists but fields are null, return defaults
      return {
        onboarding_completed: data?.onboarding_completed ?? false,
        onboarding_skipped: data?.onboarding_skipped ?? false,
        tour_completed: data?.tour_completed ?? false,
      };
    } catch (error) {
      console.error('Error checking onboarding status:', error);
      // Return default values on any error
      return {
        onboarding_completed: false,
        onboarding_skipped: false,
        tour_completed: false,
      };
    }
  }

  /**
   * Save profile setup data (Step 1)
   */
  static async saveProfileSetup(userId: string, data: ProfileSetupData): Promise<boolean> {
    try {
      // Build update object with only fields that exist
      const updateData: any = {
        updated_at: new Date().toISOString(),
      };

      // Only include fields that are provided and exist in the schema
      if (data.username !== undefined) {
        // Username should be lowercase and trimmed, stored as TEXT
        updateData.username = String(data.username).toLowerCase().trim();
      }
      if (data.birthday !== undefined) updateData.birthday = data.birthday;
      if (data.gender !== undefined) updateData.gender = data.gender;
      if (data.bio !== undefined) updateData.bio = data.bio;
      if (data.avatar_url !== undefined) updateData.avatar_url = data.avatar_url;
      
      // Handle location_city gracefully if column doesn't exist
      if (data.location_city !== undefined) {
        updateData.location_city = data.location_city;
      }

      const { error } = await supabase
        .from('users')
        .update(updateData)
        .eq('user_id', userId);

      if (error) {
        // Handle specific column errors gracefully
        if (error.code === 'PGRST204' || error.message?.includes('does not exist')) {
          console.warn('Some columns not found, trying without them:', error.message);
          // Remove potentially missing columns and retry
          const { username, location_city, ...updateWithoutOptional } = updateData;
          const { error: retryError } = await supabase
            .from('users')
            .update(updateWithoutOptional)
            .eq('user_id', userId);
          
          if (retryError) {
            // If username column exists but there's a unique constraint violation
            if (retryError.code === '23505' && retryError.message?.includes('username')) {
              throw new Error('Username is already taken');
            }
            throw retryError;
          }
          return true;
        }
        
        // Handle unique constraint violation for username
        if (error.code === '23505' && error.message?.includes('username')) {
          throw new Error('Username is already taken');
        }
        
        throw error;
      }

      return true;
    } catch (error: any) {
      console.error('Error saving profile setup:', error);
      // Re-throw username-specific errors so they can be displayed to the user
      if (error?.message?.includes('Username is already taken')) {
        throw error;
      }
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
        .from('users')
        .update({
          onboarding_skipped: true,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);

      if (error) {
        // If column doesn't exist, just log and return true (graceful degradation)
        if (error.code === '42703' || error.message?.includes('does not exist')) {
          console.warn('onboarding_skipped column not found, skipping update');
          return true;
        }
        throw error;
      }

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
        .from('users')
        .update({
          onboarding_completed: true,
          onboarding_skipped: false,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);

      if (error) {
        // If column doesn't exist, just log and return true (graceful degradation)
        if (error.code === '42703' || error.message?.includes('does not exist')) {
          console.warn('onboarding_completed column not found, skipping update');
          return true;
        }
        throw error;
      }

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
        .from('users')
        .update({
          tour_completed: true,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);

      if (error) {
        // If column doesn't exist, just log and return true (graceful degradation)
        if (error.code === '42703' || error.message?.includes('does not exist')) {
          console.warn('tour_completed column not found, skipping update');
          return true;
        }
        throw error;
      }

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

  /**
   * Save music preferences to user_preference_signals table
   * This is used during onboarding to save genre and artist preferences
   */
  static async saveMusicPreferences(
    userId: string,
    genres: string[],
    artists: { name: string; id?: string }[]
  ): Promise<boolean> {
    try {
      const signals: any[] = [];
      const now = new Date().toISOString();

      // Save genre preferences
      genres.forEach((genre, index) => {
        // Top 3 genres get higher weight (10, 9, 8), rest get decreasing weights
        const weight = Math.max(10 - index, 1);
        signals.push({
          user_id: userId,
          signal_type: 'genre_manual_preference',
          entity_type: 'genre',
          entity_id: null,
          entity_name: genre,
          signal_weight: weight,
          genre: genre,
          context: { source: 'onboarding', order: index + 1 },
          occurred_at: now,
          created_at: now,
          updated_at: now,
        });
      });

      // Save artist preferences
      artists.forEach((artist, index) => {
        // Top 3 artists get higher weight (10, 9, 8), rest get decreasing weights
        const weight = Math.max(10 - index, 1);
        signals.push({
          user_id: userId,
          signal_type: 'artist_manual_preference',
          entity_type: 'artist',
          entity_id: artist.id || null,
          entity_name: artist.name,
          signal_weight: weight,
          genre: null,
          context: { source: 'onboarding', order: index + 1 },
          occurred_at: now,
          created_at: now,
          updated_at: now,
        });
      });

      // Insert all signals in a batch
      if (signals.length > 0) {
        const { error } = await supabase
          .from('user_preference_signals')
          .insert(signals);

        if (error) {
          console.error('Error saving music preferences:', error);
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error('Error saving music preferences:', error);
      return false;
    }
  }
}

