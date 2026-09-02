import { supabase } from '@/integrations/supabase/client';
import { ensurePublicUserProfile } from '@/services/publicUserRecoveryService';

export interface OnboardingStatus {
  onboarding_completed: boolean;
  onboarding_skipped: boolean;
  tour_completed: boolean;
}

export interface ProfileSetupData {
  name?: string;
  username?: string;
  location_city?: string;
  birthday?: string;
  gender?: string;
  bio?: string;
  avatar_url?: string;
  acquisition_source?: string | null;
  other_acquisition_source?: string | null;
  contact_email?: string | null;
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
        .maybeSingle();

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

      // No row yet (new user): return defaults without logging noisy "no rows" errors.
      if (!data) {
        return {
          onboarding_completed: false,
          onboarding_skipped: false,
          tour_completed: false,
        };
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
      // Ensure user exists in public.users before updating (row may not exist for new users)
      await OnboardingService.ensureUserExists(userId);

      // Build update object with only fields that exist
      const updateData: any = {
        updated_at: new Date().toISOString(),
      };

      // Only include fields that are provided and exist in the schema
      if (data.name !== undefined) {
        updateData.name = String(data.name).trim();
      }
      if (data.username !== undefined) {
        // Username should be lowercase and trimmed, stored as TEXT
        updateData.username = String(data.username).toLowerCase().trim();
      }
      if (data.birthday !== undefined) {
        updateData.birthday = data.birthday;
        
        // Calculate age and set age verification flags
        if (data.birthday) {
          const birthDate = new Date(data.birthday);
          const today = new Date();
          let age = today.getFullYear() - birthDate.getFullYear();
          const monthDiff = today.getMonth() - birthDate.getMonth();
          
          if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
            age--;
          }
          
          // Set age verification flags
          updateData.age_verified = true;
          updateData.is_minor = age < 18;
          // Auto-enable parental controls for minors
          if (age < 18) {
            updateData.parental_controls_enabled = true;
            updateData.dm_restricted = true; // Default to restricted for minors
          }
        }
      }
      if (data.gender !== undefined) updateData.gender = data.gender;
      if (data.bio !== undefined) updateData.bio = data.bio;
      if (data.avatar_url !== undefined) updateData.avatar_url = data.avatar_url;
      
      // Handle location_city gracefully if column doesn't exist
      if (data.location_city !== undefined) {
        updateData.location_city = data.location_city;
      }
      if (data.acquisition_source !== undefined) {
        updateData.acquisition_source = data.acquisition_source;
      }
      if (data.other_acquisition_source !== undefined) {
        updateData.other_acquisition_source = data.other_acquisition_source;
      }
      if (data.contact_email !== undefined) {
        updateData.contact_email = data.contact_email;
      }

      // UPDATE, not upsert. `upsert` compiles to INSERT ... ON CONFLICT DO UPDATE, and
      // Postgres validates NOT NULL on the proposed insert tuple before it arbitrates the
      // conflict - so a payload missing users.name or users.username failed 23502 even
      // though the row always exists (ensureUserExists ran above).
      const { error } = await supabase
        .from('users')
        .update(updateData)
        .eq('user_id', userId);

      if (error) {
        // Handle specific column errors gracefully
        if (error.code === 'PGRST204' || error.message?.includes('does not exist')) {
          console.warn('Some columns not found, trying without them:', error.message);
          // Remove potentially missing columns and retry
          const updateWithoutOptional = { ...updateData };
          delete updateWithoutOptional.username;
          delete updateWithoutOptional.location_city;
          delete updateWithoutOptional.acquisition_source;
          delete updateWithoutOptional.other_acquisition_source;
          delete updateWithoutOptional.contact_email;
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
   * Targeted update for the existing-user "contact email required" retrofit gate.
   * Does not touch any other profile field, unlike saveProfileSetup.
   */
  static async updateContactEmail(userId: string, email: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('users')
        .update({ contact_email: email, updated_at: new Date().toISOString() })
        .eq('user_id', userId);
      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error updating contact email:', error);
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
   * Row is guaranteed by ensureUserExists(); a plain UPDATE avoids the NOT NULL check
   * that INSERT ... ON CONFLICT runs on the proposed tuple.
   */
  static async skipOnboarding(userId: string): Promise<boolean> {
    try {
      // Ensure user exists in public.users before updating (row may not exist for new users)
      await OnboardingService.ensureUserExists(userId);

      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('users')
        .update({
          onboarding_skipped: true,
          onboarding_completed: false,
          updated_at: now,
        })
        .eq('user_id', userId)
        .select('onboarding_completed,onboarding_skipped,tour_completed')
        .maybeSingle();

      if (error) {
        // If column doesn't exist, just log and return true (graceful degradation)
        if (error.code === '42703' || error.message?.includes('does not exist')) {
          console.warn('onboarding_skipped column not found, skipping update');
          return true;
        }
        throw error;
      }

      // Verify the write actually happened
      if (!data) {
        console.error('skipOnboarding: No data returned from update');
        return false;
      }

      // Verify onboarding_skipped is actually true
      if (data.onboarding_skipped !== true) {
        console.error('skipOnboarding: onboarding_skipped is not true after update', data);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error skipping onboarding:', error);
      return false;
    }
  }

  /**
   * Mark onboarding as completed
   * Row is guaranteed by ensureUserExists(); a plain UPDATE avoids the NOT NULL check
   * that INSERT ... ON CONFLICT runs on the proposed tuple.
   */
  static async completeOnboarding(userId: string): Promise<boolean> {
    try {
      // Ensure user exists in public.users before updating (row may not exist for new users)
      await OnboardingService.ensureUserExists(userId);

      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('users')
        .update({
          onboarding_completed: true,
          onboarding_skipped: false,
          updated_at: now,
        })
        .eq('user_id', userId)
        .select('onboarding_completed,onboarding_skipped,tour_completed')
        .maybeSingle();

      if (error) {
        // If column doesn't exist, just log and return true (graceful degradation)
        if (error.code === '42703' || error.message?.includes('does not exist')) {
          console.warn('onboarding_completed column not found, skipping update');
          return true;
        }
        throw error;
      }

      // Verify the write actually happened
      if (!data) {
        console.error('completeOnboarding: No data returned from update');
        return false;
      }

      // Verify onboarding_completed is actually true
      if (data.onboarding_completed !== true) {
        console.error('completeOnboarding: onboarding_completed is not true after update', data);
        return false;
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
   * Ensure user exists in public.users table
   * Creates a user row if it doesn't exist (for cases where trigger didn't fire)
   */
  static async ensureUserExists(userId: string): Promise<boolean> {
    try {
      const {
        data: { user: authUser },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError) {
        throw authError;
      }
      if (!authUser) {
        throw new Error('Authenticated user not found');
      }
      if (authUser.id !== userId) {
        throw new Error('Authenticated user does not match requested user_id');
      }

      const result = await ensurePublicUserProfile();
      if (!result.success) {
        throw new Error(result.error || 'Could not ensure public.users row exists');
      }

      return true;
    } catch (error: any) {
      console.error('Error ensuring user exists:', error);
      throw new Error(`Failed to ensure user record: ${error?.message ?? 'unknown error'}`);
    }
  }

  /**
   * Save onboarding music preferences as preference signals.
   *
   * IMPORTANT:
   * - Do NOT write to user_preferences.preferred_artists / preferred_genres (columns do not exist)
   * - Do ONE bulk insert into public.user_preference_signals
   * - Do NOT modify onboarding flags or navigate views
   */
  static async saveMusicPreferences(
    userId: string,
    genres: string[],
    artists: { name: string; id?: string }[]
  ): Promise<void> {
    try {
      // Ensure user exists in public.users before saving preferences
      await OnboardingService.ensureUserExists(userId);

      // IMPORTANT: use existing DB enum values; do not invent new strings
      const PREFERENCE_ENTITY_TYPE = {
        ARTIST: 'artist',
        GENRE: 'genre',
      } as const;

      const PREFERENCE_SIGNAL_TYPE = {
        ARTIST_MANUAL_PREFERENCE: 'artist_manual_preference',
        GENRE_MANUAL_PREFERENCE: 'genre_manual_preference',
      } as const;

      const now = new Date().toISOString();

      // Normalize genre for taxonomy: lowercase, trim, collapse spaces/dashes (matches DB normalize_genre_key)
      const normalizeGenre = (raw: string) =>
        raw
          .trim()
          .toLowerCase()
          .replace(/[\s\-_]+/g, ' ')
          .replace(/\s+/g, ' ')
          .trim() || raw.trim();

      const insertRows = [
        ...genres
          .filter((g) => typeof g === 'string' && g.trim().length > 0)
          .map((genre) => ({
            user_id: userId,
            signal_type: PREFERENCE_SIGNAL_TYPE.GENRE_MANUAL_PREFERENCE,
            entity_type: PREFERENCE_ENTITY_TYPE.GENRE,
            entity_id: null as string | null,
            entity_name: null as string | null,
            genre: normalizeGenre(genre),
            signal_weight: 1.0,
            context: { source: 'onboarding' },
            occurred_at: now,
          })),
        ...artists
          .filter((a) => typeof a?.name === 'string' && a.name.trim().length > 0)
          .map((artist) => ({
            user_id: userId,
            signal_type: PREFERENCE_SIGNAL_TYPE.ARTIST_MANUAL_PREFERENCE,
            entity_type: PREFERENCE_ENTITY_TYPE.ARTIST,
            entity_id: artist.id ?? null,
            entity_name: artist.id ? null : artist.name,
            genre: null as string | null,
            signal_weight: 1.0,
            context: { source: 'onboarding' },
            occurred_at: now,
          })),
      ];

      if (insertRows.length === 0) return;

      const { error } = await supabase.from('user_preference_signals').insert(insertRows);
      if (error) throw error;

      // Best-effort: immediately refresh aggregated preferences so top_genres/top_artists
      // are available to the personalization engine and settings UI without waiting
      // for a scheduled job.
      try {
        const { error: refreshError } = await supabase.rpc('refresh_user_preferences_v5', {
          p_user_id: userId,
        });
        if (refreshError) {
          console.warn(
            'OnboardingService.saveMusicPreferences: refresh_user_preferences_v5 failed (preferences may lag until the next scheduled refresh):',
            refreshError
          );
        }
      } catch (refreshErr) {
        console.warn(
          'OnboardingService.saveMusicPreferences: unexpected error calling refresh_user_preferences_v5:',
          refreshErr
        );
      }
    } catch (error: any) {
      console.error('Error saving music preferences:', error);
      // Re-throw with a more descriptive message
      if (error?.code === '23503') {
        throw new Error('User not found. Please try logging in again.');
      } else if (error?.code === '23505') {
        throw new Error('Some signals already exist. This is okay - continuing...');
      } else if (error?.message) {
        throw new Error(`Failed to save music preferences: ${error.message}`);
      }
      throw new Error('Failed to save music preferences. Please try again.');
    }
  }
}

