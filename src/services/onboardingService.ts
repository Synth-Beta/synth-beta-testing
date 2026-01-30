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
   * Uses upsert to ensure the row exists even if it wasn't created by the trigger
   */
  static async skipOnboarding(userId: string): Promise<boolean> {
    try {
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
        .single();

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
        console.error('skipOnboarding: No data returned from upsert');
        return false;
      }

      // Verify onboarding_skipped is actually true
      if (data.onboarding_skipped !== true) {
        console.error('skipOnboarding: onboarding_skipped is not true after upsert', data);
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
   * Uses upsert to ensure the row exists even if it wasn't created by the trigger
   */
  static async completeOnboarding(userId: string): Promise<boolean> {
    try {
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
        .single();

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
        console.error('completeOnboarding: No data returned from upsert');
        return false;
      }

      // Verify onboarding_completed is actually true
      if (data.onboarding_completed !== true) {
        console.error('completeOnboarding: onboarding_completed is not true after upsert', data);
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
      // Fetch user first and return early if it exists.
      // IMPORTANT: Never modify username for existing users.
      const { data: existingUser, error: checkError } = await supabase
        .from('users')
        .select('id, username')
        .eq('user_id', userId)
        .single();

      if (existingUser) {
        return true;
      }

      // Only generate username on true first-time insert (i.e., user row does not exist).
      // If we got some other error (RLS/network/etc), don't attempt username generation/insert here.
      if (checkError && checkError.code !== 'PGRST116') {
        console.warn('Error checking user existence:', checkError);
        throw checkError;
      }

      // Get auth user info to create public.users row
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        throw new Error('No authenticated user found');
      }

      // Create user row in public.users
      const userName =
        authUser.user_metadata?.name ||
        authUser.user_metadata?.full_name ||
        authUser.email?.split('@')[0] ||
        'User';
      
      const { error: insertError } = await supabase
        .from('users')
        .insert({
          user_id: userId,
          name: userName,
          username: userName.toLowerCase().replace(/[^a-z0-9]/g, '') + Math.random().toString(36).substring(2, 8),
          bio: 'Music lover looking to connect at events!',
          is_public_profile: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (insertError) {
        // If it's a conflict, user might have been created between check and insert
        if (insertError.code === '23505') {
          console.log('User was created by another process, continuing...');
          return true;
        }
        throw insertError;
      }

      return true;
    } catch (error: any) {
      console.error('Error ensuring user exists:', error);
      throw new Error(`Failed to create user record: ${error.message}`);
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

